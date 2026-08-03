"""Local Kanana adapter for contextual silence-coaching text only."""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field

from aggregator.settings import IntegrationSettings
from aggregator.transcripts import TranscriptSegment


class ContextualCoachingError(RuntimeError):
    """The local model failed or returned an unsafe/unusable sentence."""


class CoachingMessageGenerator(Protocol):
    async def generate(
        self,
        segments: Sequence[TranscriptSegment],
    ) -> str | None: ...

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
)


class KananaCoachingClient:
    """Call an OpenAI-compatible Kanana server on the private AI network."""

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

    async def generate(
        self,
        segments: Sequence[TranscriptSegment],
    ) -> str | None:
        if not self._settings.coaching_llm_configured or not segments:
            return None
        recent = tuple(segments)[
            -self._settings.coaching_llm_max_context_utterances :
        ]
        conversation = [
            {
                "speaker": f"사용자 {segment.user_id}",
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
                        "당신은 소개팅 대화 도우미입니다. 최근 대화에 직접 연결되는 "
                        "부담 없는 후속 질문을 한국어 한 문장으로만 작성하세요. "
                        "결혼·출산 압박, 외모 평가, 성적 질문, 개인정보 요청, "
                        "설명·번호·따옴표는 금지합니다."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "최근 대화: "
                        + json.dumps(conversation, ensure_ascii=False)
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
                "Kanana request or response validation failed"
            ) from error
        return self._validate_sentence(parsed.choices[0].message.content)

    def _validate_sentence(self, raw: str) -> str:
        sentence = " ".join(raw.strip().strip("\"'").split())
        if not sentence:
            raise ContextualCoachingError("Kanana returned an empty sentence")
        if len(sentence) > self._settings.coaching_llm_max_message_characters:
            raise ContextualCoachingError("Kanana sentence is too long")
        if any(fragment in sentence for fragment in _FORBIDDEN_FRAGMENTS):
            raise ContextualCoachingError("Kanana sentence failed safety filter")
        if sentence.count("?") > 1:
            raise ContextualCoachingError("Kanana returned multiple questions")
        return sentence

    async def close(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()


__all__ = [
    "CoachingMessageGenerator",
    "ContextualCoachingError",
    "KananaCoachingClient",
]
