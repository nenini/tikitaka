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
    # ⚠️ preferredGender 는 **사용자 본인의 성별**이다(BE가 profile.getGender() 를 담는다).
    #    여기서는 "여성 사용자"라는 뜻이고, 기대 결과는 남성 페르소나다.
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


def test_health_reports_which_llm_backend_is_live(client: TestClient) -> None:
    """설정이 없으면 조용히 Ollama 로 폴백한다 — 겉으로는 정상으로 보인다.

    배포 후 `curl /health` 로 구분할 수 있어야 해서 백엔드 이름을 싣는다.
    키 값은 절대 나가면 안 된다.
    """
    body = client.get("/health").json()
    assert body["llm"] in {"gms", "ollama"}
    assert "key" not in json.dumps(body).lower()


def test_llm_adapter_is_built_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """요청마다 다시 만들면 폴백 경고가 헬스체크(15초)마다 쌓인다."""
    import chatbot.api as api

    monkeypatch.setattr(api, "_llm", None)
    assert api.get_llm() is api.get_llm()


def test_first_message_selects_persona(client: TestClient) -> None:
    response = client.post("/api/v1/chat/stream", json=_first_request())
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    text = response.text
    assert "event: persona" in text
    assert "event: chunk" in text
    assert "event: done" in text
    key = _persona_key(text)
    assert key.startswith("MALE_")  # 여성 사용자 → 남성 페르소나
    assert f'"personaKey": "{key}"' in text  # done에 같은 키


def test_persona_is_the_opposite_gender_of_the_user() -> None:
    """소개팅 연습이므로 상대는 사용자와 **반대 성별**이어야 한다.

    `preferredGender` 라는 이름과 달리 BE 는 여기에 사용자 본인의 성별을 담는다
    (`AiChatContextService`: `new AiChatPersonaCondition(profile.getGender(), age)`).
    그대로 `select_persona` 에 넘기면 동성 페르소나가 나온다 — 실제로 그랬고,
    이 테스트가 없어서 아무도 몰랐다.
    """
    from chatbot.persona_catalog import select_partner

    assert select_partner("MALE").spec.gender == "female"
    assert select_partner("FEMALE").spec.gender == "male"


def test_opposite_gender_matching_survives_age_filters(client: TestClient) -> None:
    """나이 조건이 붙어도 성별 반전이 유지된다 — 나이로 좁히다 동성이 섞이면 안 된다."""
    body = _first_request()
    body["personaCondition"] = {
        "preferredGender": "MALE",  # 남성 사용자
        "minPreferredAge": 25,
        "maxPreferredAge": 30,
    }
    key = _persona_key(client.post("/api/v1/chat/stream", json=body).text)
    assert key.startswith("FEMALE_")  # 남성 사용자 → 여성 페르소나


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


# ── 대기열 SSE 계약 (BE 계약 2026-08-05) ──────────────────────────────
def _events(text: str) -> list[tuple[str, dict[str, object]]]:
    """SSE 본문 → [(event, data)]."""
    out: list[tuple[str, dict[str, object]]] = []
    name: str | None = None
    for line in text.splitlines():
        if line.startswith("event:"):
            name = line.split(":", 1)[1].strip()
        elif line.startswith("data:") and name is not None:
            out.append((name, json.loads(line.split(":", 1)[1].strip())))
            name = None
    return out


def test_stream_emits_started_and_sequenced_chunks(client: TestClient) -> None:
    response = client.post("/api/v1/chat/stream", json=_first_request())
    assert response.status_code == 200
    events = _events(response.text)
    names = [n for n, _ in events]
    assert "started" in names
    assert names[-1] == "done"

    started = next(d for n, d in events if n == "started")
    assert started["sessionId"] == 15
    done = next(d for n, d in events if n == "done")
    assert done["sessionId"] == 15

    chunks = [d for n, d in events if n == "chunk"]
    assert chunks, "본문이 최소 한 조각은 나와야 한다"
    assert [c["sequence"] for c in chunks] == list(range(1, len(chunks) + 1))
    assert all(c["content"] for c in chunks)


def test_no_queued_event_when_slot_is_free(client: TestClient) -> None:
    """자리가 있으면 곧장 시작한다 — 불필요한 queued 로 FE를 대기 화면에 보내지 않는다."""
    response = client.post("/api/v1/chat/stream", json=_first_request())
    names = [n for n, _ in _events(response.text)]
    assert "queued" not in names
    assert "heartbeat" not in names


def test_queue_full_returns_503_before_streaming(client: TestClient) -> None:
    """스트림을 열기 전에 거절해야 503을 줄 수 있다. 200을 낸 뒤엔 못 준다."""
    from chatbot.api import get_gate
    from chatbot.queue_gate import LlmGate

    full = LlmGate(max_concurrent=1, max_waiting=0, wait_timeout_seconds=1.0)
    full.enter()  # 유일한 실행 자리를 미리 점유
    app.dependency_overrides[get_gate] = lambda: full
    try:
        response = client.post("/api/v1/chat/stream", json=_first_request())
        assert response.status_code == 503
        assert response.json()["code"] == "AI_QUEUE_FULL"
        assert response.headers["Retry-After"]
    finally:
        app.dependency_overrides.pop(get_gate, None)


def test_queue_timeout_is_reported_as_error_event(client: TestClient) -> None:
    """이미 스트림이 열렸으므로 HTTP 상태가 아니라 error 이벤트로 알린다."""
    from chatbot.api import get_gate
    from chatbot.queue_gate import LlmGate

    busy = LlmGate(max_concurrent=1, max_waiting=5, wait_timeout_seconds=0.2)
    busy.enter()  # 자리를 붙잡아 뒤 요청이 만료되게 한다
    app.dependency_overrides[get_gate] = lambda: busy
    try:
        response = client.post("/api/v1/chat/stream", json=_first_request())
        assert response.status_code == 200
        events = _events(response.text)
        names = [n for n, _ in events]
        assert "queued" in names
        assert names[-1] == "error"
        assert dict(events[-1][1])["code"] == "AI_QUEUE_TIMEOUT"
        assert "started" not in names
    finally:
        app.dependency_overrides.pop(get_gate, None)


def test_queued_event_carries_position(client: TestClient) -> None:
    from chatbot.api import get_gate
    from chatbot.queue_gate import LlmGate

    busy = LlmGate(max_concurrent=1, max_waiting=5, wait_timeout_seconds=0.2)
    busy.enter()
    app.dependency_overrides[get_gate] = lambda: busy
    try:
        response = client.post("/api/v1/chat/stream", json=_first_request())
        queued = next(d for n, d in _events(response.text) if n == "queued")
        assert queued["position"] == 1
    finally:
        app.dependency_overrides.pop(get_gate, None)


def test_heartbeat_is_sent_while_waiting(monkeypatch: pytest.MonkeyPatch) -> None:
    """대기 중 아무것도 안 보내면 nginx가 죽은 연결로 보고 끊는다."""
    import chatbot.api as api
    from chatbot.queue_gate import LlmGate

    monkeypatch.setattr(api, "HEARTBEAT_SECONDS", 0.05)
    busy = LlmGate(max_concurrent=1, max_waiting=5, wait_timeout_seconds=0.4)
    busy.enter()
    app.dependency_overrides[get_llm] = lambda: MockLLM("네")
    app.dependency_overrides[api.get_gate] = lambda: busy
    try:
        with TestClient(app) as client:
            response = client.post("/api/v1/chat/stream", json=_first_request())
        events = _events(response.text)
        beats = [d for n, d in events if n == "heartbeat"]
        assert beats, "만료 전에 heartbeat가 최소 한 번은 나가야 한다"
        assert beats[0]["status"] == "QUEUED"
    finally:
        app.dependency_overrides.clear()


def test_new_events_are_not_mistaken_for_content_by_backend(client: TestClient) -> None:
    """BE가 아직 안 고쳐졌어도 깨지지 않아야 한다.

    BE HttpAiChatResponseStreamer 는 모르는 이벤트 이름을 chunk 로 흘려보내고
    `content`/`text`/`token` 키를 찾는다. 새 이벤트에 그 키가 있으면 대기 안내가
    답변 본문에 섞여 사용자에게 보인다.
    """
    from chatbot.api import get_gate
    from chatbot.queue_gate import LlmGate

    busy = LlmGate(max_concurrent=1, max_waiting=5, wait_timeout_seconds=0.2)
    busy.enter()
    app.dependency_overrides[get_gate] = lambda: busy
    try:
        response = client.post("/api/v1/chat/stream", json=_first_request())
    finally:
        app.dependency_overrides.pop(get_gate, None)

    normal = client.post("/api/v1/chat/stream", json=_first_request())
    for name, data in _events(response.text) + _events(normal.text):
        if name == "chunk":
            continue
        assert not {"content", "text", "token"} & set(data), (
            f"{name} 이벤트가 BE에서 답변 본문으로 오인된다: {data}"
        )
