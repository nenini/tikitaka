"""Backend coaching HTTP delivery behavior."""

from __future__ import annotations

import asyncio
import json

import httpx

from aggregator.backend_client import BackendCoachingClient
from aggregator.coaching import CoachingCommand
from aggregator.settings import IntegrationSettings


def _command() -> CoachingCommand:
    return CoachingCommand(
        session_id="15",
        target_user_id="1",
        coaching_type="REACTION_PROMPT",
        message_key="REACTION_PROMPT_01",
        priority="MEDIUM",
        reason_code="NO_REACTION",
        triggered_at_session_elapsed_ms=20_000,
        expires_at_session_elapsed_ms=25_000,
        deduplication_key="15:1:REACTION_PROMPT:20000",
        event_id="fixed-event-id",
        occurred_at="2026-07-30T10:00:20+00:00",
    )


def test_sends_backend_v1_contract_and_internal_token() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "eventId": "fixed-event-id",
                    "status": "DELIVERED",
                },
            },
        )

    async def scenario() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = BackendCoachingClient(
                IntegrationSettings(
                    internal_token="shared-token",
                    backend_base_url="http://backend:8080",
                ),
                http_client=http_client,
            )
            receipt = await client.send(_command())
            assert receipt.status == "DELIVERED"

    asyncio.run(scenario())

    assert len(requests) == 1
    request = requests[0]
    assert request.url == (
        "http://backend:8080/internal/ai/coaching-events"
    )
    assert request.headers["X-Internal-Token"] == "shared-token"
    payload = json.loads(request.content)
    assert payload["version"] == 1
    assert payload["eventId"] == "fixed-event-id"
    assert payload["messageText"]


def test_retry_keeps_same_event_and_deduplication_ids() -> None:
    payloads: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payloads.append(json.loads(request.content))
        if len(payloads) == 1:
            return httpx.Response(503, json={"message": "temporary"})
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "eventId": "fixed-event-id",
                    "status": "DUPLICATE",
                },
            },
        )

    async def no_sleep(_: float) -> None:
        return None

    async def scenario() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = BackendCoachingClient(
                IntegrationSettings(
                    internal_token="shared-token",
                    backend_base_url="http://backend:8080",
                    backend_max_attempts=2,
                ),
                http_client=http_client,
                sleep=no_sleep,
            )
            receipt = await client.send(_command())
            assert receipt.status == "DUPLICATE"

    asyncio.run(scenario())

    assert len(payloads) == 2
    assert payloads[0]["eventId"] == payloads[1]["eventId"]
    assert (
        payloads[0]["deduplicationKey"]
        == payloads[1]["deduplicationKey"]
    )
