"""Local Kanana OpenAI-compatible adapter and safety fallback."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from aggregator.llm_coaching import (
    ContextualCoachingError,
    KananaCoachingClient,
)
from aggregator.settings import IntegrationSettings
from aggregator.transcripts import TranscriptSegment


def _segment(text: str) -> TranscriptSegment:
    return TranscriptSegment(
        event_id="event-1",
        utterance_id="utterance-1",
        session_id="15",
        user_id="1",
        participant_identity="user-1",
        client_instance_id="client-1",
        seq=1,
        start_ms=0,
        end_ms=1_000,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at="2026-07-30T10:00:01+00:00",
    )


def _settings() -> IntegrationSettings:
    return IntegrationSettings(
        internal_token="token",
        backend_base_url="http://backend:8080",
        coaching_llm_enabled=True,
        coaching_llm_base_url="http://kanana:8100",
        coaching_llm_model="kakaocorp/kanana-2-3b-instruct",
    )


def test_generates_one_contextual_sentence_without_external_identity() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "제주도에서 가장 좋았던 장소를 물어보세요."
                        }
                    }
                ]
            },
        )

    async def scenario() -> str | None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as http_client:
            client = KananaCoachingClient(
                _settings(),
                http_client=http_client,
            )
            return await client.generate([_segment("제주도 여행을 좋아해요.")])

    message = asyncio.run(scenario())

    assert message == "제주도에서 가장 좋았던 장소를 물어보세요."
    assert len(requests) == 1
    assert str(requests[0].url) == (
        "http://kanana:8100/v1/chat/completions"
    )
    payload = json.loads(requests[0].content)
    assert payload["model"] == "kakaocorp/kanana-2-3b-instruct"
    serialized = requests[0].content.decode("utf-8")
    assert "제주도 여행을 좋아해요." in serialized
    assert "participant_identity" not in serialized
    assert "utterance_id" not in serialized


def test_rejects_unsafe_or_multiple_question_output() -> None:
    responses = iter(
        [
            "결혼 계획이 언제인지 물어보세요.",
            "취미가 뭔가요? 여행도 좋아하나요?",
        ]
    )

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": next(responses)}}
                ]
            },
        )

    async def scenario() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as http_client:
            client = KananaCoachingClient(
                _settings(),
                http_client=http_client,
            )
            with pytest.raises(ContextualCoachingError):
                await client.generate([_segment("여행을 좋아해요.")])
            with pytest.raises(ContextualCoachingError):
                await client.generate([_segment("여행을 좋아해요.")])

    asyncio.run(scenario())


def test_disabled_llm_uses_fallback_without_http_request() -> None:
    settings = IntegrationSettings(
        internal_token="token",
        backend_base_url="http://backend:8080",
        coaching_llm_enabled=False,
    )

    async def scenario() -> str | None:
        client = KananaCoachingClient(settings)
        try:
            return await client.generate([_segment("여행을 좋아해요.")])
        finally:
            await client.close()

    assert asyncio.run(scenario()) is None
