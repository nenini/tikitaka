"""LiveKit Vision v4 topic, consent, sender, and schema validation."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

from livekit import rtc

from aggregator.livekit_vision import (
    VISION_DATA_TOPIC,
    LiveKitVisionAdapter,
)
from aggregator.session_contracts import SessionEventRequest
from aggregator.vision_events import VisionEventBatch

_FIXTURE_DIR = (
    Path(__file__).parents[2] / "vision-analysis" / "tests" / "fixtures"
)


def _event() -> dict[str, object]:
    with (_FIXTURE_DIR / "vision-behavior-event.valid.json").open(
        encoding="utf-8"
    ) as fixture_file:
        event = json.load(fixture_file)
    event["sessionId"] = "15"
    event["userId"] = "1"
    return cast(dict[str, object], event)


def _lifecycle(*, vision_enabled: bool = True) -> SessionEventRequest:
    return SessionEventRequest.model_validate(
        {
            "eventId": "start-15",
            "eventType": "AI_SESSION_STARTED",
            "version": 1,
            "sessionId": "15",
            "actualStartAt": "2026-07-30T10:00:00Z",
            "participants": [
                {
                    "userId": "1",
                    "participantIdentity": "user-1",
                    "sttEnabled": True,
                    "visionEnabled": vision_enabled,
                }
            ],
            "features": {
                "sttEnabled": True,
                "visionEnabled": vision_enabled,
                "coachingEnabled": True,
            },
        }
    )


def _packet(
    batch: Mapping[str, object],
    *,
    identity: str = "user-1",
    kind: Any = rtc.DataPacketKind.KIND_RELIABLE,
) -> rtc.DataPacket:
    return rtc.DataPacket(
        data=json.dumps(batch).encode(),
        kind=kind,
        participant=SimpleNamespace(identity=identity),  # type: ignore[arg-type]
        topic=VISION_DATA_TOPIC,
    )


def test_accepts_reliable_v4_batch_from_matching_consented_sender() -> None:
    async def scenario() -> None:
        accepted: list[VisionEventBatch] = []

        async def sink(batch: VisionEventBatch) -> object:
            accepted.append(batch)
            return "accepted"

        adapter = LiveKitVisionAdapter(event=_lifecycle(), sink=sink)
        await adapter.handle_packet(
            _packet(
                {
                    "behaviorEvents": [_event()],
                    "metricSnapshots": [],
                }
            )
        )

        assert len(accepted) == 1
        assert accepted[0].behavior_events[0].user_id == "1"

    asyncio.run(scenario())


def test_rejects_sender_user_mismatch_unreliable_and_no_consent() -> None:
    async def scenario() -> None:
        accepted: list[VisionEventBatch] = []

        async def sink(batch: VisionEventBatch) -> object:
            accepted.append(batch)
            return "accepted"

        batch = {
            "behaviorEvents": [_event()],
            "metricSnapshots": [],
        }
        adapter = LiveKitVisionAdapter(event=_lifecycle(), sink=sink)
        await adapter.handle_packet(_packet(batch, identity="user-2"))
        await adapter.handle_packet(
            _packet(batch, kind=rtc.DataPacketKind.KIND_LOSSY)
        )

        no_consent = LiveKitVisionAdapter(
            event=_lifecycle(vision_enabled=False),
            sink=sink,
        )
        await no_consent.handle_packet(_packet(batch))
        assert accepted == []

    asyncio.run(scenario())


def test_rejects_payload_user_or_session_spoofing() -> None:
    async def scenario() -> None:
        accepted: list[VisionEventBatch] = []

        async def sink(batch: VisionEventBatch) -> object:
            accepted.append(batch)
            return "accepted"

        adapter = LiveKitVisionAdapter(event=_lifecycle(), sink=sink)
        wrong_user = _event()
        wrong_user["userId"] = "2"
        await adapter.handle_packet(
            _packet(
                {
                    "behaviorEvents": [wrong_user],
                    "metricSnapshots": [],
                }
            )
        )
        wrong_session = deepcopy(_event())
        wrong_session["sessionId"] = "99"
        await adapter.handle_packet(
            _packet(
                {
                    "behaviorEvents": [wrong_session],
                    "metricSnapshots": [],
                }
            )
        )
        assert accepted == []

    asyncio.run(scenario())
