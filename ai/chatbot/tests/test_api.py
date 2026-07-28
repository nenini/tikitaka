"""챗봇 스트리밍 API 테스트 (BE 무상태 계약) — MockLLM(ollama 불필요)."""

from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from chatbot.api import app, get_llm
from chatbot.llm import MockLLM


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_llm] = lambda: MockLLM("안녕하세요 반가워요")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _first_request() -> dict[str, object]:
    return {
        "userId": 1,
        "sessionId": 15,
        "purpose": "DATE_PRACTICE",
        "personaCondition": {"preferredGender": "FEMALE", "preferredAge": 26},
        "selectedPersonaKey": None,
        "history": [{"sequenceNo": 1, "role": "USER", "content": "안녕하세요"}],
    }


def _persona_key(sse_text: str) -> str:
    for block in sse_text.split("\n\n"):
        if block.startswith("event: persona"):
            data = block.split("data: ", 1)[1]
            key = json.loads(data)["personaKey"]
            assert isinstance(key, str)
            return key
    raise AssertionError("persona 이벤트 없음")


def test_health(client: TestClient) -> None:
    assert client.get("/health").json()["status"] == "ok"


def test_first_message_selects_persona(client: TestClient) -> None:
    response = client.post("/api/v1/chat/stream", json=_first_request())
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    text = response.text
    assert "event: persona" in text
    assert "event: chunk" in text
    assert "event: done" in text
    key = _persona_key(text)
    assert key.startswith("FEMALE_")  # 여성 조건 → 여성 페르소나
    assert f'"personaKey": "{key}"' in text  # done에 같은 키


def test_followup_reuses_key_without_persona_event(client: TestClient) -> None:
    body = {
        "userId": 1,
        "sessionId": 15,
        "selectedPersonaKey": "FEMALE_26_CALM_01",
        "history": [
            {"sequenceNo": 1, "role": "USER", "content": "안녕하세요"},
            {"sequenceNo": 2, "role": "AI", "content": "반가워요"},
            {"sequenceNo": 3, "role": "USER", "content": "주말에 뭐 하세요?"},
        ],
    }
    text = client.post("/api/v1/chat/stream", json=body).text
    assert "event: persona" not in text  # 키가 있으면 persona 이벤트 생략
    assert "event: chunk" in text
    assert '"personaKey": "FEMALE_26_CALM_01"' in text


def test_unknown_persona_key_emits_error(client: TestClient) -> None:
    body = {"userId": 1, "sessionId": 15, "selectedPersonaKey": "NOPE_00", "history": []}
    text = client.post("/api/v1/chat/stream", json=body).text
    assert "event: error" in text
    assert "PERSONA_NOT_FOUND" in text


def test_missing_required_field_returns_400(client: TestClient) -> None:
    response = client.post("/api/v1/chat/stream", json={"userId": 1})  # sessionId 없음
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_AI_CHAT_REQUEST"


def test_token_enforced_when_set(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_CHAT_INTERNAL_TOKEN", "secret")
    bad = client.post("/api/v1/chat/stream", json=_first_request(), headers={"X-Internal-Token": "wrong"})
    assert bad.status_code == 401
    ok = client.post("/api/v1/chat/stream", json=_first_request(), headers={"X-Internal-Token": "secret"})
    assert ok.status_code == 200
