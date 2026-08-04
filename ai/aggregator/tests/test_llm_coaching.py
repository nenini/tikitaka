"""EXAONE OpenAI-compatible adapter and safety fallback."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from aggregator.llm_coaching import (
    ContextualCoachingError,
    ExaoneCoachingClient,
)
from aggregator.settings import IntegrationSettings
from aggregator.transcripts import TranscriptSegment


def _segment(text: str, *, user_id: str = "1") -> TranscriptSegment:
    return TranscriptSegment(
        event_id="event-1",
        utterance_id="utterance-1",
        session_id="15",
        user_id=user_id,
        participant_identity=f"user-{user_id}",
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
        coaching_llm_base_url="http://exaone:8100",
        coaching_llm_model="LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct",
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
                            "content": "제주도에서는 어떤 장소가 가장 좋으셨어요?"
                        }
                    }
                ]
            },
        )

    async def scenario() -> str | None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as http_client:
            client = ExaoneCoachingClient(
                _settings(),
                http_client=http_client,
            )
            return await client.generate(
                [
                    _segment("여행을 좋아하세요?", user_id="2"),
                    _segment("제주도 여행을 좋아해요.", user_id="1"),
                ],
                target_user_id="2",
            )

    message = asyncio.run(scenario())

    assert message == "제주도에서는 어떤 장소가 가장 좋으셨어요?"
    assert len(requests) == 1
    assert str(requests[0].url) == (
        "http://exaone:8100/v1/chat/completions"
    )
    payload = json.loads(requests[0].content)
    assert payload["model"] == (
        "LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct"
    )
    serialized = requests[0].content.decode("utf-8")
    assert "제주도 여행을 좋아해요." in serialized
    assert "소개팅 대화 컨설턴트" in serialized
    user_prompt = payload["messages"][1]["content"]
    assert '"speaker": "코칭 대상"' in user_prompt
    assert '"speaker": "상대방"' in user_prompt
    assert "반드시 물음표로 끝내세요" in serialized
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
            client = ExaoneCoachingClient(
                _settings(),
                http_client=http_client,
            )
            with pytest.raises(ContextualCoachingError):
                await client.generate(
                    [_segment("여행을 좋아해요.")],
                    target_user_id="2",
                )
            with pytest.raises(ContextualCoachingError):
                await client.generate(
                    [_segment("여행을 좋아해요.")],
                    target_user_id="2",
                )

    asyncio.run(scenario())


def test_disabled_llm_uses_fallback_without_http_request() -> None:
    settings = IntegrationSettings(
        internal_token="token",
        backend_base_url="http://backend:8080",
        coaching_llm_enabled=False,
    )

    async def scenario() -> str | None:
        client = ExaoneCoachingClient(settings)
        try:
            return await client.generate(
                [_segment("여행을 좋아해요.")],
                target_user_id="2",
            )
        finally:
            await client.close()

    assert asyncio.run(scenario()) is None


@pytest.mark.parametrize(
    "response",
    [
        "오늘 대화가 즐거웠네요!",
        "상대방에게 여행에 관해 질문해 보세요.",
        "제주도에서 어디가 좋았어요",
    ],
)
def test_rejects_evaluation_instruction_or_non_question(response: str) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": response}}]},
        )

    async def scenario() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as http_client:
            client = ExaoneCoachingClient(
                _settings(),
                http_client=http_client,
            )
            with pytest.raises(ContextualCoachingError):
                await client.generate(
                    [_segment("제주도를 좋아해요.")],
                    target_user_id="2",
                )

    asyncio.run(scenario())


def test_validation_error_preserves_raw_output_for_local_diagnostics() -> None:
    client = ExaoneCoachingClient(_settings())

    with pytest.raises(ContextualCoachingError) as captured:
        client._validate_sentence("샌드위치를 자주 드시나요")

    assert captured.value.raw_output == "샌드위치를 자주 드시나요"


@pytest.mark.parametrize(
    "response",
    [
        "질문 작성 예시: 제주도에서 어디가 좋았어요?",
        "질문만 출력하세요.",
    ],
)
def test_rejects_model_instruction_leakage(response: str) -> None:
    client = ExaoneCoachingClient(_settings())

    with pytest.raises(ContextualCoachingError):
        client._validate_sentence(response)
