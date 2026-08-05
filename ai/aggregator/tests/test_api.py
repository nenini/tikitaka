"""FastAPI health, authentication, and lifecycle contract."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from collections.abc import Awaitable, Callable

from fastapi.testclient import TestClient
from stt.events import SttEvent

from aggregator.audio_adapter import SessionAudioAdapter
from aggregator.api import create_app
from aggregator.backend_contracts import BackendCoachingReceipt
from aggregator.coaching import CoachingCommand
from aggregator.session_contracts import SessionEventRequest
from aggregator.settings import IntegrationSettings
from aggregator.transcripts import RetainedTranscript, TranscriptSegment


class FakeSender:
    async def send(
        self,
        command: CoachingCommand,
    ) -> BackendCoachingReceipt:
        return BackendCoachingReceipt(
            event_id=command.event_id,
            status="DELIVERED",
        )

    async def close(self) -> None:
        return None


class FakeAudioAdapter:
    def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None


class FakeAudioAdapterFactory:
    async def warmup(self) -> None:
        return None

    def create(
        self,
        _event: SessionEventRequest,
        _sink: Callable[[SttEvent], Awaitable[bool]],
        _vision_sink: object,
        _elapsed_ms: Callable[[], int],
    ) -> SessionAudioAdapter:
        return FakeAudioAdapter()

    async def close(self) -> None:
        return None


_STARTED: dict[str, object] = {
    "eventId": "session-15-ai-session-started",
    "eventType": "AI_SESSION_STARTED",
    "version": 1,
    "sessionId": "15",
    "actualStartAt": "2026-07-30T10:00:00Z",
    "participants": [
        {
            "userId": "1",
            "participantIdentity": "user-1",
            "sttEnabled": True,
            "visionEnabled": True,
        },
        {
            "userId": "2",
            "participantIdentity": "user-2",
            "sttEnabled": True,
            "visionEnabled": True,
        },
    ],
    "features": {
        "sttEnabled": True,
        "visionEnabled": True,
        "coachingEnabled": True,
    },
    "liveKit": {
        "url": "wss://livekit.example.test",
        "roomName": "session-15",
        "accessToken": "secret-room-token",
        "participantIdentity": "ai-session-15",
    },
}


def _client() -> TestClient:
    app = create_app(
        IntegrationSettings(
            internal_token="shared-token",
            backend_base_url="http://backend:8080",
            tick_interval_seconds=3600,
        ),
        sender=FakeSender(),
        audio_adapter_factory=FakeAudioAdapterFactory(),
    )
    return TestClient(app)


def test_health_and_authenticated_session_start() -> None:
    with _client() as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["activeSessionCount"] == 0

        unauthorized = client.post(
            "/api/v1/sessions/events",
            json=_STARTED,
        )
        assert unauthorized.status_code == 401

        response = client.post(
            "/api/v1/sessions/events",
            headers={"X-Internal-Token": "shared-token"},
            json=_STARTED,
        )
        assert response.status_code == 200
        assert response.json() == {
            "eventId": "session-15-ai-session-started",
            "status": "PROCESSED",
        }
        assert client.get("/health").json()["activeSessionCount"] == 1


def test_duplicate_returns_http_200_and_duplicate_status() -> None:
    with _client() as client:
        headers = {"X-Internal-Token": "shared-token"}
        first = client.post(
            "/api/v1/sessions/events",
            headers=headers,
            json=_STARTED,
        )
        duplicate = client.post(
            "/api/v1/sessions/events",
            headers=headers,
            json=_STARTED,
        )

        assert first.status_code == 200
        assert duplicate.status_code == 200
        assert duplicate.json()["status"] == "DUPLICATE"


def test_rejects_unsupported_session_contract_version() -> None:
    with _client() as client:
        invalid = {**_STARTED, "eventId": "unsupported", "version": 2}
        response = client.post(
            "/api/v1/sessions/events",
            headers={"X-Internal-Token": "shared-token"},
            json=invalid,
        )

        assert response.status_code == 400
        assert "unsupported session event version" in response.json()["detail"]


def test_rejects_missing_livekit_connection() -> None:
    with _client() as client:
        invalid = {
            key: value
            for key, value in _STARTED.items()
            if key != "liveKit"
        }
        invalid["eventId"] = "missing-livekit"
        response = client.post(
            "/api/v1/sessions/events",
            headers={"X-Internal-Token": "shared-token"},
            json=invalid,
        )

        assert response.status_code == 400
        assert "requires liveKit" in response.json()["detail"]


def test_rejects_participant_identity_that_breaks_backend_mapping() -> None:
    with _client() as client:
        invalid = deepcopy(_STARTED)
        invalid["eventId"] = "bad-participant-identity"
        participants = invalid["participants"]
        assert isinstance(participants, list)
        first = participants[0]
        assert isinstance(first, dict)
        first["participantIdentity"] = "someone-else"
        response = client.post(
            "/api/v1/sessions/events",
            headers={"X-Internal-Token": "shared-token"},
            json=invalid,
        )

        assert response.status_code == 400
        assert "participantIdentity must be user-1" in response.json()["detail"]


def test_practice_goals_are_optional() -> None:
    """BE가 아직 안 보내는 필드다. 없어도 통과해야 기존 배포가 안 깨진다."""
    parsed = SessionEventRequest.model_validate(_STARTED)
    assert parsed.participants is not None
    assert all(p.practice_goals == [] for p in parsed.participants)


def test_practice_goals_are_carried_when_sent() -> None:
    payload = deepcopy(_STARTED)
    participants = payload["participants"]
    assert isinstance(participants, list)
    first = participants[0]
    assert isinstance(first, dict)
    first["practiceGoals"] = ["TALK_TOO_MUCH", "VOICE_TOO_LOUD"]
    parsed = SessionEventRequest.model_validate(payload)
    assert parsed.participants is not None
    assert parsed.participants[0].practice_goals == ["TALK_TOO_MUCH", "VOICE_TOO_LOUD"]
    assert parsed.participants[1].practice_goals == []


# ── 신고 처리용 전사 조회 (BE moderation 모듈) ────────────────────────
def _retained_segment() -> TranscriptSegment:
    return TranscriptSegment(
        event_id="evt-1",
        utterance_id="utt-1",
        session_id="15",
        user_id="1",
        participant_identity="user-1",
        client_instance_id="client-1",
        seq=1,
        start_ms=12_000,
        end_ms=14_000,
        text="안녕하세요 반가워요",
        confidence=0.9,
        language="ko",
        occurred_at="2026-08-05T12:00:00+00:00",
    )


def test_transcript_requires_token() -> None:
    with _client() as client:
        assert client.get("/api/v1/sessions/15/transcript").status_code == 401


def test_transcript_404_when_nothing_retained() -> None:
    """보관 기간(기본 30분)이 지났거나 발화가 없으면 404.

    빈 문자열을 200으로 주면 BE가 AI_TRANSCRIPT_EMPTY 로 받아 원인 구분이 안 된다.
    """
    with _client() as client:
        response = client.get(
            "/api/v1/sessions/nope/transcript",
            headers={"X-Internal-Token": "shared-token"},
        )
        assert response.status_code == 404


def test_transcript_returns_be_contract_fields() -> None:
    """BE HttpAiSessionTranscriptClient 는 transcript·generatedAt 만 읽는다."""
    client = _client()
    with client:
        manager = client.app.state.session_manager  # type: ignore[attr-defined]
        ended = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)
        manager._retained_transcripts["15"] = RetainedTranscript(
            session_id="15",
            ended_at=ended,
            expires_at=ended + timedelta(minutes=30),
            segments=(_retained_segment(),),
        )
        response = client.get(
            "/api/v1/sessions/15/transcript",
            headers={"X-Internal-Token": "shared-token"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["transcript"].strip(), "BE는 비면 AI_TRANSCRIPT_EMPTY 로 처리한다"
    assert "안녕하세요 반가워요" in body["transcript"]
    assert body["generatedAt"] == ended.isoformat()
    assert body["segmentCount"] == 1
