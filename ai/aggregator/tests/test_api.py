"""FastAPI health, authentication, and lifecycle contract."""

from __future__ import annotations

from copy import deepcopy
from collections.abc import Awaitable, Callable

from fastapi.testclient import TestClient
from stt.events import SttEvent

from aggregator.audio_adapter import SessionAudioAdapter
from aggregator.api import create_app
from aggregator.backend_contracts import BackendCoachingReceipt
from aggregator.coaching import CoachingCommand
from aggregator.session_contracts import SessionEventRequest
from aggregator.settings import IntegrationSettings


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
