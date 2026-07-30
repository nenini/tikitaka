"""Own one SessionAggregator runtime per active Backend session."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from typing import Protocol

from stt.events import SttEvent

from aggregator.aggregator import (
    SessionAggregator,
    VisionBatchIngestionResult,
)
from aggregator.audio_adapter import (
    SessionAudioAdapter,
    SessionAudioAdapterFactory,
)
from aggregator.backend_client import (
    BackendCoachingClient,
    BackendDeliveryError,
)
from aggregator.backend_contracts import BackendCoachingReceipt
from aggregator.coaching import CoachingCommand
from aggregator.events import AnalysisEvent
from aggregator.livekit_stt import LiveKitSttAdapterFactory
from aggregator.session_contracts import (
    SessionEventRequest,
    SessionEventResponse,
)
from aggregator.settings import IntegrationSettings
from aggregator.vision_events import (
    VisionEvent,
    VisionEventBatch,
)

logger = logging.getLogger(__name__)

_PROCESSED_EVENT_CAPACITY = 4096


class CoachingSender(Protocol):
    async def send(
        self,
        command: CoachingCommand,
    ) -> BackendCoachingReceipt: ...

    async def close(self) -> None: ...


class SessionEventContractError(ValueError):
    """Backend sent a lifecycle event that violates contract v1."""


class SessionNotActiveError(KeyError):
    """No runtime exists for the requested session."""


class SessionRuntime:
    """Tick and delivery workers for one active video-call session."""

    def __init__(
        self,
        event: SessionEventRequest,
        settings: IntegrationSettings,
        sender: CoachingSender,
        audio_adapter_factory: SessionAudioAdapterFactory,
        *,
        now: Callable[[], datetime],
    ) -> None:
        if event.actual_start_at is None or event.participants is None:
            raise SessionEventContractError(
                "AI_SESSION_STARTED requires actualStartAt and participants"
            )
        if event.actual_start_at.tzinfo is None:
            raise SessionEventContractError(
                "actualStartAt must include a timezone"
            )
        self.session_id = event.session_id
        self.actual_start_at = event.actual_start_at
        self.participants = {
            participant.user_id: participant
            for participant in event.participants
        }
        self.features = event.features
        self._settings = settings
        self._sender = sender
        self._audio_adapter: SessionAudioAdapter | None = None
        self._now = now
        self._commands: asyncio.Queue[CoachingCommand] = asyncio.Queue(
            maxsize=100
        )
        self._lock = asyncio.Lock()
        self._tick_task: asyncio.Task[None] | None = None
        self._delivery_task: asyncio.Task[None] | None = None
        self.aggregator = SessionAggregator(
            event.session_id,
            on_analysis=self._on_analysis,
            on_coaching=self._on_coaching,
            participant_user_ids=list(self.participants),
        )
        if (
            event.features is None
            or event.features.stt_enabled
        ) and any(
            participant.stt_enabled
            for participant in self.participants.values()
        ):
            self._audio_adapter = audio_adapter_factory.create(
                event,
                self.push_stt_event,
                self.elapsed_ms,
            )

    def start(self) -> None:
        self._tick_task = asyncio.create_task(
            self._tick_loop(),
            name=f"aggregator-tick-{self.session_id}",
        )
        self._delivery_task = asyncio.create_task(
            self._delivery_loop(),
            name=f"aggregator-delivery-{self.session_id}",
        )
        if self._audio_adapter is not None:
            self._audio_adapter.start()

    def _on_analysis(self, event: AnalysisEvent) -> None:
        logger.debug(
            "analysis event session=%s type=%s",
            event.session_id,
            event.event_type,
        )

    def _on_coaching(self, command: CoachingCommand) -> None:
        if self.features is not None and not self.features.coaching_enabled:
            return
        try:
            self._commands.put_nowait(command)
        except asyncio.QueueFull:
            logger.error(
                "coaching queue full; dropped eventId=%s",
                command.event_id,
            )

    def elapsed_ms(self) -> int:
        delta = self._now() - self.actual_start_at.astimezone(timezone.utc)
        return max(0, int(delta.total_seconds() * 1000))

    async def tick(self, now_ms: int | None = None) -> None:
        async with self._lock:
            self.aggregator.tick(
                self.elapsed_ms() if now_ms is None else now_ms
            )

    async def push_stt_event(
        self,
        event: SttEvent | Mapping[str, object],
    ) -> bool:
        async with self._lock:
            return self.aggregator.push_stt_event(event)

    async def push_vision_event(
        self,
        event: VisionEvent | Mapping[str, object],
    ) -> bool:
        async with self._lock:
            return self.aggregator.push_vision_event(event)

    async def push_vision_batch(
        self,
        batch: VisionEventBatch | Mapping[str, object],
    ) -> VisionBatchIngestionResult:
        async with self._lock:
            return self.aggregator.push_vision_batch(batch)

    async def wait_until_delivered(self) -> None:
        await self._commands.join()

    async def stop(self) -> None:
        if self._audio_adapter is not None:
            await self._audio_adapter.stop()
        self.aggregator.state.session_active = False
        if self._tick_task is not None:
            self._tick_task.cancel()
            await asyncio.gather(self._tick_task, return_exceptions=True)
        try:
            await asyncio.wait_for(
                self._commands.join(),
                timeout=self._settings.shutdown_flush_timeout_seconds,
            )
        except TimeoutError:
            logger.warning(
                "coaching flush timed out session=%s pending=%d",
                self.session_id,
                self._commands.qsize(),
            )
        if self._delivery_task is not None:
            self._delivery_task.cancel()
            await asyncio.gather(
                self._delivery_task,
                return_exceptions=True,
            )

    async def _tick_loop(self) -> None:
        try:
            while True:
                await self.tick()
                await asyncio.sleep(self._settings.tick_interval_seconds)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "aggregator tick worker stopped session=%s",
                self.session_id,
            )

    async def _delivery_loop(self) -> None:
        while True:
            command = await self._commands.get()
            try:
                receipt = await self._sender.send(command)
                logger.info(
                    "coaching receipt eventId=%s status=%s",
                    receipt.event_id,
                    receipt.status,
                )
            except BackendDeliveryError:
                logger.exception(
                    "coaching delivery failed eventId=%s",
                    command.event_id,
                )
            except Exception:
                logger.exception(
                    "unexpected coaching worker error eventId=%s",
                    command.event_id,
                )
            finally:
                self._commands.task_done()


class SessionManager:
    """Validate lifecycle events and keep the active runtime registry."""

    def __init__(
        self,
        settings: IntegrationSettings,
        *,
        sender: CoachingSender | None = None,
        audio_adapter_factory: SessionAudioAdapterFactory | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.settings = settings
        self._sender = sender or BackendCoachingClient(settings)
        self._audio_adapter_factory = (
            audio_adapter_factory or LiveKitSttAdapterFactory(settings)
        )
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._sessions: dict[str, SessionRuntime] = {}
        self._processed_event_ids: set[str] = set()
        self._processed_event_order: deque[str] = deque()
        self._lifecycle_lock = asyncio.Lock()
        self._started = False

    @property
    def active_session_count(self) -> int:
        return len(self._sessions)

    async def handle(
        self,
        event: SessionEventRequest,
    ) -> SessionEventResponse:
        async with self._lifecycle_lock:
            if event.version != 1:
                raise SessionEventContractError(
                    f"unsupported session event version: {event.version}"
                )
            if event.event_id in self._processed_event_ids:
                return SessionEventResponse(
                    event_id=event.event_id,
                    status="DUPLICATE",
                )
            if event.event_type == "AI_SESSION_STARTED":
                status = await self._start(event)
            elif event.event_type == "AI_SESSION_ENDED":
                status = await self._end(event)
            else:
                raise SessionEventContractError(
                    f"unsupported eventType: {event.event_type}"
                )
            self._remember(event.event_id)
            return SessionEventResponse(
                event_id=event.event_id,
                status=status,
            )

    async def startup(self) -> None:
        if self._started:
            return
        await self._audio_adapter_factory.warmup()
        self._started = True

    async def _start(
        self,
        event: SessionEventRequest,
    ) -> str:
        if not event.participants:
            raise SessionEventContractError(
                "AI_SESSION_STARTED requires participants"
            )
        if event.actual_start_at is None:
            raise SessionEventContractError(
                "AI_SESSION_STARTED requires actualStartAt"
            )
        if event.live_kit is None:
            raise SessionEventContractError(
                "AI_SESSION_STARTED requires liveKit"
            )
        if not event.live_kit.url.startswith(("ws://", "wss://")):
            raise SessionEventContractError(
                "liveKit.url must use ws:// or wss://"
            )
        expected_ai_identity = f"ai-session-{event.session_id}"
        if (
            event.live_kit.participant_identity
            != expected_ai_identity
        ):
            raise SessionEventContractError(
                "liveKit.participantIdentity must be "
                f"{expected_ai_identity}"
            )
        user_ids = [participant.user_id for participant in event.participants]
        participant_identities = [
            participant.participant_identity
            for participant in event.participants
        ]
        if len(user_ids) != len(set(user_ids)):
            raise SessionEventContractError(
                "participants must have unique userId values"
            )
        if len(participant_identities) != len(set(participant_identities)):
            raise SessionEventContractError(
                "participants must have unique participantIdentity values"
            )
        for participant in event.participants:
            expected_user_identity = f"user-{participant.user_id}"
            if participant.participant_identity != expected_user_identity:
                raise SessionEventContractError(
                    "participantIdentity must be "
                    f"{expected_user_identity} for userId "
                    f"{participant.user_id}"
                )
        if not self._started:
            raise RuntimeError("SessionManager.startup() must run first")
        if event.session_id in self._sessions:
            return "DUPLICATE"
        runtime = SessionRuntime(
            event,
            self.settings,
            self._sender,
            self._audio_adapter_factory,
            now=self._now,
        )
        self._sessions[event.session_id] = runtime
        runtime.start()
        return "PROCESSED"

    async def _end(
        self,
        event: SessionEventRequest,
    ) -> str:
        if event.ended_at is None:
            raise SessionEventContractError(
                "AI_SESSION_ENDED requires endedAt"
            )
        runtime = self._sessions.pop(event.session_id, None)
        if runtime is not None:
            await runtime.stop()
        return "PROCESSED"

    def runtime(self, session_id: str) -> SessionRuntime:
        try:
            return self._sessions[session_id]
        except KeyError as error:
            raise SessionNotActiveError(session_id) from error

    def _remember(self, event_id: str) -> None:
        self._processed_event_ids.add(event_id)
        self._processed_event_order.append(event_id)
        if len(self._processed_event_order) > _PROCESSED_EVENT_CAPACITY:
            expired = self._processed_event_order.popleft()
            self._processed_event_ids.discard(expired)

    async def close(self) -> None:
        sessions = list(self._sessions.values())
        self._sessions.clear()
        await asyncio.gather(
            *(runtime.stop() for runtime in sessions),
            return_exceptions=True,
        )
        await self._sender.close()
        await self._audio_adapter_factory.close()
