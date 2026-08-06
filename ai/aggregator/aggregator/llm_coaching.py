"""EXAONE adapter for contextual silence-coaching text only."""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field

from aggregator.settings import IntegrationSettings
from aggregator.transcripts import TranscriptSegment

logger = logging.getLogger(__name__)


class ContextualCoachingError(RuntimeError):
    """The local model failed or returned an unsafe/unusable sentence."""

    def __init__(
        self,
        message: str,
        *,
        raw_output: str | None = None,
    ) -> None:
        super().__init__(message)
        self.raw_output = raw_output


class CoachingMessageGenerator(Protocol):
    async def generate(
        self,
        segments: Sequence[TranscriptSegment],
        target_user_id: str,
    ) -> str | None: ...

    async def warmup(self) -> None: ...

    async def close(self) -> None: ...


class _ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    content: str


class _ChatChoice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: _ChatMessage


class _ChatResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    choices: list[_ChatChoice] = Field(min_length=1)


_FORBIDDEN_FRAGMENTS = (
    "결혼은 언제",
    "결혼 계획",
    "아이를 낳",
    "출산 계획",
    "외모를 평가",
    "몸매",
    "성관계",
    "연락처를 알려",
    "주소를 알려",
    "주민등록번호",
    "질문해 보세요",
    "물어보세요",
    "대화를 이어",
    "즐거운 대화",
    "응원합니다",
    "질문 작성 예시",
    "질문만 출력",
    "출력하세요",
    "작성하세요",
)


class ExaoneCoachingClient:
    """Call an OpenAI-compatible EXAONE server on the private AI network."""

    def __init__(
        self,
        settings: IntegrationSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._owns_http_client = http_client is None
        self._http_client = http_client or httpx.AsyncClient(
            timeout=settings.coaching_llm_timeout_seconds
        )

    async def warmup(self) -> None:
        """세션 시작 시 모델을 VRAM에 올려 두고 내려가지 않게 고정한다.

        Ollama는 기본 5분 유휴면 모델을 내린다. 그 뒤 첫 요청은 로딩까지 포함해
        **4.7초**가 걸려 코칭 타임아웃(3초)을 넘긴다 — 워밍업 후엔 0.6초다(실측
        2026-08-06). 가장 눈에 띄는 '세션 시작 직후 첫 코칭'이 정확히 이 경우다.

        `keep_alive`는 **네이티브 `/api/chat`에만 먹는다.** OpenAI 호환
        `/v1/chat/completions`는 이 필드를 조용히 무시한다(실측: expires_at 이
        그대로 5분 뒤였다). 그래서 워밍업만 네이티브로 보낸다.

        best-effort다. 백엔드가 Ollama가 아니면(exaone_server 등) 404가 나는데,
        그때는 그냥 넘어간다 — 첫 요청에서 로딩될 뿐이다.
        """
        if not self._settings.coaching_llm_configured:
            return
        base = self._settings.coaching_llm_base_url.rstrip("/").removesuffix("/v1")
        try:
            await self._http_client.post(
                f"{base}/api/chat",
                json={
                    "model": self._settings.coaching_llm_model,
                    "messages": [{"role": "user", "content": "."}],
                    "stream": False,
                    "keep_alive": self._settings.coaching_llm_keep_alive,
                    "options": {"num_predict": 1},
                },
            )
        except httpx.HTTPError as error:
            logger.info("coaching llm warmup skipped: %r", error)

    async def generate(
        self,
        segments: Sequence[TranscriptSegment],
        target_user_id: str,
    ) -> str | None:
        if not self._settings.coaching_llm_configured or not segments:
            return None
        recent = tuple(segments)[
            -self._settings.coaching_llm_max_context_utterances :
        ]
        conversation = [
            {
                "speaker": (
                    "코칭 대상"
                    if segment.user_id == target_user_id
                    else "상대방"
                ),
                "text": segment.text,
            }
            for segment in recent
        ]
        payload = {
            "model": self._settings.coaching_llm_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "당신은 소개팅 대화 컨설턴트입니다. 대화가 잠시 멈췄을 때 "
                        "코칭 대상이 상대방에게 바로 건넬 수 있는 후속 질문을 "
                        "작성합니다. 최근 대화에서 상대방이 실제로 말한 주제 하나에 "
                        "직접 연결하고, 이미 답한 내용을 다시 묻거나 새로운 사실을 "
                        "지어내지 마세요. 결과는 자연스러운 존댓말 질문 한 문장만 "
                        "출력하고 반드시 물음표로 끝내세요. 대화 평가·요약·인사·응원·"
                        "종료 표현과 '질문해 보세요' 같은 지시문은 금지합니다. "
                        "결혼·출산 압박, 외모 평가, 성적 질문, 개인정보·연락처·주소·"
                        "연봉 요청도 금지합니다. 설명·번호·따옴표를 붙이지 마세요."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "최근 대화는 다음과 같습니다.\n"
                        + json.dumps(conversation, ensure_ascii=False)
                        + "\n코칭 대상이 상대방의 마지막 발언에 이어서 말할 수 있는 "
                        "후속 질문 한 문장만 작성하세요."
                    ),
                },
            ],
            "temperature": 0.3,
            "max_tokens": 80,
        }
        url = (
            f"{self._settings.coaching_llm_base_url}"
            "/v1/chat/completions"
        )
        try:
            response = await self._http_client.post(url, json=payload)
            response.raise_for_status()
            parsed = _ChatResponse.model_validate(response.json())
        except (httpx.HTTPError, ValueError) as error:
            raise ContextualCoachingError(
                "EXAONE request or response validation failed"
            ) from error
        return self._validate_sentence(parsed.choices[0].message.content)

    def _validate_sentence(self, raw: str) -> str:
        sentence = " ".join(raw.strip().strip("\"'").split())
        if not sentence:
            raise ContextualCoachingError(
                "EXAONE returned an empty sentence",
                raw_output=raw,
            )
        if len(sentence) > self._settings.coaching_llm_max_message_characters:
            raise ContextualCoachingError(
                "EXAONE sentence is too long",
                raw_output=sentence,
            )
        if any(fragment in sentence for fragment in _FORBIDDEN_FRAGMENTS):
            raise ContextualCoachingError(
                "EXAONE sentence failed safety filter",
                raw_output=sentence,
            )
        if sentence.count("?") != 1 or not sentence.endswith("?"):
            raise ContextualCoachingError(
                "EXAONE must return exactly one question",
                raw_output=sentence,
            )
        return sentence

    async def close(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()


__all__ = [
    "CoachingMessageGenerator",
    "ContextualCoachingError",
    "ExaoneCoachingClient",
]
