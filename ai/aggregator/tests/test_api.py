"""FastAPI health, authentication, and lifecycle contract."""

from __future__ import annotations

from fastapi.testclient import TestClient

from aggregator.api import create_app
from aggregator.backend_contracts import BackendCoachingReceipt
from aggregator.coaching import CoachingCommand
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


_STARTED = {
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
}


def _client() -> TestClient:
    app = create_app(
        IntegrationSettings(
            internal_token="shared-token",
            backend_base_url="http://backend:8080",
            tick_interval_seconds=3600,
        ),
        sender=FakeSender(),
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
