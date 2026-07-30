"""Vision v4 behavior -> Backend analysis-event v1 adapter."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx

from aggregator.settings import IntegrationSettings
from aggregator.vision_backend import (
    BackendVisionClient,
    to_backend_vision_request,
)
from aggregator.vision_events import (
    VISION_EVENT_ADAPTER,
    VisionBehaviorEvent,
    VisionBehaviorEventBase,
)

_FIXTURE_DIR = (
    Path(__file__).parents[2] / "vision-analysis" / "tests" / "fixtures"
)


def _event() -> VisionBehaviorEvent:
    with (_FIXTURE_DIR / "vision-behavior-event.valid.json").open(
        encoding="utf-8"
    ) as fixture_file:
        raw = json.load(fixture_file)
    raw["sessionId"] = "15"
    raw["userId"] = "1"
    event = VISION_EVENT_ADAPTER.validate_python(raw)
    assert isinstance(event, VisionBehaviorEventBase)
    return event


def test_converts_v4_behavior_to_backend_v1_without_raw_frames() -> None:
    request = to_backend_vision_request(_event(), "user-1")
    payload = request.model_dump(by_alias=True, mode="json")

    assert payload["version"] == 1
    assert payload["eventType"] == "VISION_ANALYSIS"
    assert payload["participantIdentity"] == "user-1"
    assert payload["payload"]["visionContractVersion"] == 4
    assert payload["payload"]["visionEventType"] == "GAZE_AWAY_STARTED"
    stored_details = json.dumps(payload["payload"]["details"]).lower()
    assert "frame" not in stored_details
    assert "landmark" not in stored_details


def test_sends_vision_event_to_backend_contract_endpoint() -> None:
    requests: list[httpx.Request] = []
    event = _event()

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "eventId": str(event.event_id),
                    "status": "STORED",
                },
            },
        )

    async def scenario() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = BackendVisionClient(
                IntegrationSettings(
                    internal_token="shared-token",
                    backend_base_url="http://backend:8080",
                ),
                http_client=http_client,
            )
            receipt = await client.send(event, "user-1")
            assert receipt.status == "STORED"

    asyncio.run(scenario())
    assert len(requests) == 1
    assert requests[0].url == (
        "http://backend:8080"
        "/internal/ai/sessions/analysis-events/vision"
    )
    assert requests[0].headers["X-Internal-Token"] == "shared-token"
