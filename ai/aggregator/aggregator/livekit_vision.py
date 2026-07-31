"""LiveKit reliable data packets -> validated VisionEventBatch v4."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable

from livekit import rtc
from pydantic import ValidationError

from aggregator.session_contracts import SessionEventRequest
from aggregator.vision_events import VisionEventBatch

logger = logging.getLogger(__name__)

VISION_DATA_TOPIC = "vision.v4"
# LiveKit reliable data packets have a small payload budget. Browser batches
# are expected every 0.5 seconds and must contain events, never raw frames.
MAX_VISION_PACKET_BYTES = 15_000

VisionBatchSink = Callable[[VisionEventBatch], Awaitable[object]]


class LiveKitVisionAdapter:
    """Validate the real LiveKit sender before forwarding a Vision v4 batch."""

    def __init__(
        self,
        *,
        event: SessionEventRequest,
        sink: VisionBatchSink,
    ) -> None:
        self._event = event
        self._sink = sink
        self._participants = {
            participant.participant_identity: participant
            for participant in event.participants or []
            if participant.vision_enabled
        }
        self._enabled = bool(
            (event.features is None or event.features.vision_enabled)
            and self._participants
        )
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def enabled(self) -> bool:
        return self._enabled

    def register(self, room: rtc.Room) -> None:
        @room.on("data_received")
        def on_data_received(packet: rtc.DataPacket) -> None:
            if packet.topic != VISION_DATA_TOPIC:
                return
            task = asyncio.create_task(
                self.handle_packet(packet),
                name=f"livekit-vision-{self._event.session_id}",
            )
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)

    async def close(self) -> None:
        if not self._tasks:
            return
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    async def handle_packet(self, packet: rtc.DataPacket) -> None:
        participant = packet.participant
        identity = participant.identity if participant is not None else None
        if not self._enabled:
            logger.warning(
                "vision packet rejected session=%s identity=%s reason=disabled",
                self._event.session_id,
                identity,
            )
            return
        if packet.kind != rtc.DataPacketKind.KIND_RELIABLE:
            logger.warning(
                "vision packet rejected session=%s identity=%s "
                "reason=unreliable",
                self._event.session_id,
                identity,
            )
            return
        if participant is None:
            logger.warning(
                "vision packet rejected session=%s reason=missing-sender",
                self._event.session_id,
            )
            return
        session_participant = self._participants.get(participant.identity)
        if session_participant is None:
            logger.warning(
                "vision packet rejected session=%s identity=%s "
                "reason=unexpected-or-no-consent",
                self._event.session_id,
                participant.identity,
            )
            return
        if len(packet.data) > MAX_VISION_PACKET_BYTES:
            logger.warning(
                "vision packet rejected session=%s identity=%s "
                "reason=packet-too-large bytes=%d",
                self._event.session_id,
                participant.identity,
                len(packet.data),
            )
            return

        try:
            decoded = packet.data.decode("utf-8")
            raw = json.loads(decoded)
            batch = VisionEventBatch.model_validate(raw)
        except (UnicodeDecodeError, json.JSONDecodeError, ValidationError):
            logger.warning(
                "vision packet rejected session=%s identity=%s "
                "reason=invalid-v4-json",
                self._event.session_id,
                participant.identity,
                exc_info=True,
            )
            return

        events = batch.ordered_events()
        if not events:
            logger.warning(
                "vision packet rejected session=%s identity=%s "
                "reason=empty-batch",
                self._event.session_id,
                participant.identity,
            )
            return
        if any(event.session_id != self._event.session_id for event in events):
            logger.warning(
                "vision packet rejected session=%s identity=%s "
                "reason=session-mismatch",
                self._event.session_id,
                participant.identity,
            )
            return
        if any(event.user_id != session_participant.user_id for event in events):
            logger.warning(
                "vision packet rejected session=%s identity=%s "
                "reason=user-mismatch",
                self._event.session_id,
                participant.identity,
            )
            return

        try:
            result = await self._sink(batch)
        except Exception:
            logger.exception(
                "vision batch ingestion failed session=%s identity=%s",
                self._event.session_id,
                participant.identity,
            )
            return
        logger.info(
            "vision batch accepted session=%s user=%s identity=%s "
            "events=%d result=%s",
            self._event.session_id,
            session_participant.user_id,
            participant.identity,
            len(events),
            result,
        )
