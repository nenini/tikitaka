"""리포트 BE 발행 (S15P11A307-494).

BE와 합의한 두 엔드포인트에 POST한다.
  ① /internal/v1/session-analyses        — 객관 지표 (참가자 전원, 요청 1번)
  ② /internal/v1/session-reports/results — LLM 생성물 (유저별, 요청 N번)

`backend_client.BackendCoachingClient`와 재시도 정책을 공유한다(설정도 같은 것을 쓴다).
다르게 만든 이유는 두 가지다.
  - 멱등키 헤더가 필요하다. 코칭 이벤트는 eventId로 중복을 걸러 헤더가 없다.
  - 응답 계약이 다르다(`duplicate` / `acceptedCount`).

⚠️ **실패해도 예외를 위로 던지지 않는 경로가 있다.** 세션 종료 처리를 막지 않으려고
   관제실이 "작업 큐에 등록하고 즉시 PROCESSED 응답"을 요청했으므로, 발행은 백그라운드에서
   돌고 실패는 로그로 남긴다. 단 리포트 생성 실패는 반드시 FAILED로 콜백해야 한다 —
   안 보내면 프론트가 PENDING 화면에 계속 머문다.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

import httpx

from aggregator.settings import IntegrationSettings

logger = logging.getLogger(__name__)

Sleep = Callable[[float], Awaitable[None]]

ANALYSES_PATH = "/internal/v1/session-analyses"
REPORT_RESULTS_PATH = "/internal/v1/session-reports/results"


class ReportPublishError(RuntimeError):
    """설정한 횟수만큼 시도해도 전달하지 못했다."""


class ReportPublisher:
    """페이로드 하나를 멱등키와 함께 보낸다. 재시도 중에도 같은 키를 유지한다."""

    def __init__(
        self,
        settings: IntegrationSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._settings = settings
        self._sleep = sleep
        self._owns_http_client = http_client is None
        self._http_client = http_client or httpx.AsyncClient(
            # 리포트는 배치라 코칭보다 여유를 준다. 코칭 타임아웃(5초)을 쓰면 큰 본문에서 끊긴다.
            timeout=settings.report_llm_timeout_seconds
        )

    async def publish_analysis(
        self,
        payload: dict[str, object],
        *,
        idempotency_key: str,
    ) -> bool:
        """①번. 반환값은 `duplicate` — True면 BE가 이미 갖고 있던 것이다."""
        data = await self._post(ANALYSES_PATH, payload, idempotency_key)
        return bool(data.get("duplicate", False))

    async def publish_report(
        self,
        payload: dict[str, object],
        *,
        idempotency_key: str,
    ) -> int:
        """②번. 반환값은 `acceptedCount`."""
        data = await self._post(REPORT_RESULTS_PATH, payload, idempotency_key)
        accepted = data.get("acceptedCount", 0)
        return accepted if isinstance(accepted, int) else 0

    async def _post(
        self,
        path: str,
        payload: dict[str, object],
        idempotency_key: str,
    ) -> dict[str, object]:
        if not self._settings.backend_configured:
            raise ReportPublishError(
                "BACKEND_BASE_URL and AI_SESSION_INTERNAL_TOKEN are required"
            )
        url = f"{self._settings.backend_base_url}{path}"
        headers = {
            "X-Internal-Token": self._settings.internal_token,
            "Idempotency-Key": idempotency_key,
            "Content-Type": "application/json",
        }

        last_error: Exception | None = None
        for attempt in range(1, self._settings.backend_max_attempts + 1):
            try:
                response = await self._http_client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                return _parse_envelope(response.json(), path)
            except (httpx.TransportError, httpx.HTTPStatusError) as error:
                last_error = error
                if not _retryable(error) or attempt == self._settings.backend_max_attempts:
                    break
                await self._sleep(self._settings.backend_retry_delay_seconds)
            except ValueError as error:  # JSON 파싱 실패 — 재시도해도 같다
                raise ReportPublishError(f"{path} 응답이 JSON이 아닙니다") from error

        raise ReportPublishError(
            f"{path} 전달 실패 (key={idempotency_key})"
        ) from last_error

    async def close(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()


RETRYABLE_CONFLICT_CODE = "REPORT_NOT_PREPARED"
"""BE가 아직 리포트 행을 만들지 않았다는 뜻의 409. 이것만 다시 보낼 가치가 있다.

BE는 세션 종료 이벤트를 받고 리포트 행을 먼저 만드는데, 그 준비가 끝나기 전에 우리
POST가 도착하면 이 코드로 409를 준다. 요청이 틀린 게 아니라 순서가 이른 것뿐이라
잠시 뒤엔 성공한다. 재시도하지 않으면 그 세션의 리포트 문장이 영구히 유실된다.
"""


def _retryable(error: Exception) -> bool:
    """일시적 장애만 재시도한다. 4xx는 우리 요청이 틀린 것이라 다시 보내도 같다.

    **409는 코드를 봐야 갈린다.** BE가 409로 쓰는 세 가지 중 재시도가 의미 있는 건
    REPORT_NOT_PREPARED 하나뿐이다. ANALYSIS_IDEMPOTENCY_CONFLICT 와
    REPORT_RESULT_CONFLICT 는 "같은 버전에 다른 내용이 이미 저장돼 있다"는 뜻이라
    몇 번을 보내도 같은 답이 온다. 전부 재시도하면 영구 실패를 지연 실패로 바꿀 뿐이다.
    """
    if isinstance(error, httpx.TransportError):
        return True
    if not isinstance(error, httpx.HTTPStatusError):
        return False
    status = error.response.status_code
    if status == 429 or status >= 500:
        return True
    if status != 409:
        return False
    return _error_code(error.response) == RETRYABLE_CONFLICT_CODE


def _error_code(response: httpx.Response) -> str | None:
    """BE 공통 오류 응답(`ApiErrorResponse`)의 `code`. 못 읽으면 None."""
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    code = body.get("code")
    return code if isinstance(code, str) else None


def _parse_envelope(body: object, path: str) -> dict[str, object]:
    """BE 공통 응답 `{success, data}`를 벗긴다."""
    if not isinstance(body, dict):
        raise ReportPublishError(f"{path} 응답이 객체가 아닙니다")
    if body.get("success") is not True:
        raise ReportPublishError(f"{path} 요청이 거부됐습니다: {body!r}")
    data = body.get("data")
    return data if isinstance(data, dict) else {}
