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


def _retryable(error: Exception) -> bool:
    """일시적 장애만 재시도한다. 4xx는 우리 요청이 틀린 것이라 다시 보내도 같다."""
    if isinstance(error, httpx.TransportError):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        return status == 429 or status >= 500
    return False


def _parse_envelope(body: object, path: str) -> dict[str, object]:
    """BE 공통 응답 `{success, data}`를 벗긴다."""
    if not isinstance(body, dict):
        raise ReportPublishError(f"{path} 응답이 객체가 아닙니다")
    if body.get("success") is not True:
        raise ReportPublishError(f"{path} 요청이 거부됐습니다: {body!r}")
    data = body.get("data")
    return data if isinstance(data, dict) else {}
