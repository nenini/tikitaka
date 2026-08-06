"""AI 화상 세션 프롬프트·LLM 어댑터 (기능명세서 §9-B).

관심사는 두 개다. 상황 시나리오가 프롬프트에 정확히 들어가는가, 그리고 GMS 스트리밍
응답을 토큰으로 제대로 풀어내는가.
"""

from __future__ import annotations

import json

import httpx
import pytest

from chatbot.llm import GmsChatAdapter, GmsChatConfigError, _sse_delta
from chatbot.persona import (
    SCENARIOS,
    build_system_prompt,
    scenario_labels,
    scenario_of,
)
from chatbot.schemas import PersonaSpec


def _spec() -> PersonaSpec:
    return PersonaSpec(gender="female", age_group="20대", hobbies=["전시"])


# ── 상황 시나리오 ────────────────────────────────────────────────────
def test_scenarios_are_topics_not_places() -> None:
    """장소(카페/식당)로는 AI가 묻는 내용이 안 달라진다 — 주제로 잡는다."""
    assert SCENARIOS == ("first_meet", "hobby", "work", "food", "travel")


def test_every_scenario_has_a_label_and_opening() -> None:
    for code in SCENARIOS:
        picked = scenario_of(code)
        assert picked is not None
        assert picked.label and picked.situation and picked.opening
    assert len(scenario_labels()) == len(SCENARIOS)


def test_openings_are_all_different() -> None:
    """주제가 달라도 첫 마디가 같으면 주제를 고른 의미가 없다."""
    openings = {scenario_of(c).opening for c in SCENARIOS}  # type: ignore[union-attr]
    assert len(openings) == len(SCENARIOS)


@pytest.mark.parametrize(
    ("scenario", "marker"),
    [("first_meet", "처음 인사"), ("hobby", "취미와 관심사"), ("work", "일 이야기"),
     ("food", "음식 이야기"), ("travel", "여행 이야기")],
)
def test_scenario_replaces_the_stage_sentence(scenario: str, marker: str) -> None:
    """시나리오를 주면 stage 문장 대신 쓴다 — 둘을 같이 말하면 시점이 모순된다."""
    prompt = build_system_prompt(_spec(), stage="before", scenario=scenario)
    assert marker in prompt
    assert "소개팅 전이라" not in prompt


def test_unknown_scenario_falls_back_to_stage() -> None:
    prompt = build_system_prompt(_spec(), stage="before", scenario="nope")
    assert "소개팅 전이라" in prompt


def test_no_scenario_keeps_existing_behaviour() -> None:
    """챗봇 텍스트 대화는 시나리오를 안 주므로 지금과 같아야 한다."""
    assert build_system_prompt(_spec(), stage="after") == build_system_prompt(
        _spec(), stage="after", scenario=None
    )


def test_difficulty_is_no_longer_injected() -> None:
    """난이도는 제거됐다(팀 결정 2026-08-05). 단어만 넣어봤자 LLM이 매번 다르게 해석한다."""
    prompt = build_system_prompt(_spec(), stage="before", scenario="cafe")
    assert "난이도" not in prompt


def test_scenario_keeps_speech_style_rules() -> None:
    """시나리오가 말투 규칙을 덮어써서는 안 된다."""
    prompt = build_system_prompt(_spec(), stage="before", scenario="cafe")
    assert "구어체" in prompt


# ── GMS 스트리밍 파싱 ────────────────────────────────────────────────
def _chunk(content: str) -> str:
    return "data: " + json.dumps({"choices": [{"delta": {"content": content}}]})


def test_sse_delta_extracts_content() -> None:
    assert _sse_delta(_chunk("안녕")) == "안녕"


@pytest.mark.parametrize(
    "line",
    ["", "   ", ": keep-alive", "data: [DONE]", "data: {broken", "event: ping",
     'data: {"choices": []}', 'data: {"choices": [{"delta": {}}]}'],
)
def test_sse_delta_ignores_non_content_lines(line: str) -> None:
    """한 줄이 깨졌다고 대화를 끊을 이유가 없다."""
    assert _sse_delta(line) is None


def test_stream_yields_tokens_in_order() -> None:
    body = "\n".join([_chunk("안녕"), _chunk("하세요"), "data: [DONE]"])

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"].startswith("Bearer ")
        sent = json.loads(request.content)
        assert sent["stream"] is True
        assert sent["messages"][0]["role"] == "system"
        return httpx.Response(200, text=body)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    adapter = GmsChatAdapter(
        base_url="https://gms.test/v1", api_key="k", client=client
    )
    assert list(adapter.stream(system_prompt="s", history=[], user_text="안녕")) == [
        "안녕",
        "하세요",
    ]


def test_endpoint_appends_to_v1_base() -> None:
    adapter = GmsChatAdapter(base_url="https://gms.test/v1/", api_key="k")
    assert adapter.endpoint == "https://gms.test/v1/chat/completions"


def test_from_env_requires_both_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GMS_BASE_URL", "")
    monkeypatch.setenv("GMS_API_KEY", "")
    with pytest.raises(GmsChatConfigError):
        GmsChatAdapter.from_env()


def test_http_error_propagates() -> None:
    """조용히 빈 응답을 내면 호출자가 LLM이 침묵한 줄 안다."""
    client = httpx.Client(
        transport=httpx.MockTransport(lambda _r: httpx.Response(500, text="boom"))
    )
    adapter = GmsChatAdapter(base_url="https://gms.test/v1", api_key="k", client=client)
    with pytest.raises(httpx.HTTPStatusError):
        list(adapter.stream(system_prompt="s", history=[], user_text="안녕"))
