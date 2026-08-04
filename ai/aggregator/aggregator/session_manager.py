"""Own one SessionAggregator runtime per active Backend session."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

from stt.events import SttEvent, TranscriptFinalizedEvent

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
from aggregator.events import AnalysisEvent, SilenceDetected
from aggregator.livekit_stt import LiveKitSttAdapterFactory
from aggregator.llm_coaching import (
    CoachingMessageGenerator,
    ContextualCoachingError,
    ExaoneCoachingClient,
)
from aggregator.session_contracts import (
    SessionEventRequest,
    SessionEventResponse,
)
from aggregator.speech_events import parse_stt_event
from aggregator.settings import IntegrationSettings
from aggregator.transcripts import RetainedTranscript, TranscriptSegment
from aggregator.vision_events import (
    VisionBehaviorEvent,
    VisionEvent,
    VisionEventBatch,
)
from aggregator.vision_backend import (
    IMPORTANT_VISION_BEHAVIOR_TYPES,
    BackendVisionClient,
    BackendVisionDeliveryError,
    BackendVisionReceipt,
)

logger = logging.getLogger(__name__)

_PROCESSED_EVENT_CAPACITY = 4096


@dataclass(frozen=True)
class _QueuedCoaching:
    command: CoachingCommand
    transcript_context: tuple[TranscriptSegment, ...]


class CoachingSender(Protocol):
    async def send(
        self,
        command: CoachingCommand,
    ) -> BackendCoachingReceipt: ...

    async def close(self) -> None: ...


class VisionAnalysisSender(Protocol):
    async def send(
        self,
        event: VisionBehaviorEvent,
        participant_identity: str,
    ) -> BackendVisionReceipt: ...

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
        vision_sender: VisionAnalysisSender,
        audio_adapter_factory: SessionAudioAdapterFactory,
        message_generator: CoachingMessageGenerator,
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
        self._vision_sender = vision_sender
        self._message_generator = message_generator
        self._audio_adapter: SessionAudioAdapter | None = None
        self._now = now
        self._commands: asyncio.Queue[_QueuedCoaching] = asyncio.Queue(
            maxsize=100
        )
        self._vision_events: asyncio.Queue[
            tuple[VisionBehaviorEvent, str]
        ] = asyncio.Queue(maxsize=200)
        self._lock = asyncio.Lock()
        self._tick_task: asyncio.Task[None] | None = None
        self._delivery_task: asyncio.Task[None] | None = None
        self._vision_delivery_task: asyncio.Task[None] | None = None
        self.aggregator = SessionAggregator(
            event.session_id,
            on_analysis=self._on_analysis,
            on_coaching=self._on_coaching,
            participant_user_ids=list(self.participants),
        )
        stt_enabled = (
            event.features is None
            or event.features.stt_enabled
        ) and any(
            participant.stt_enabled
            for participant in self.participants.values()
        )
        vision_enabled = (
            event.features is None
            or event.features.vision_enabled
        ) and any(
            participant.vision_enabled
            for participant in self.participants.values()
        )
        if stt_enabled or vision_enabled:
            self._audio_adapter = audio_adapter_factory.create(
                event,
                self.push_stt_event,
                self.push_vision_batch,
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
        self._vision_delivery_task = asyncio.create_task(
            self._vision_delivery_loop(),
            name=f"vision-delivery-{self.session_id}",
        )
        if self._audio_adapter is not None:
            self._audio_adapter.start()

    def _on_analysis(self, event: AnalysisEvent) -> None:
        if isinstance(event, SilenceDetected):
            logger.info(
                "silence detected session=%s elapsedMs=%d durationSec=%.1f",
                event.session_id,
                event.session_elapsed_ms,
                event.payload.silence_sec,
            )
        else:
            logger.debug(
                "analysis event session=%s type=%s",
                event.session_id,
                event.event_type,
            )

    def _on_coaching(self, command: CoachingCommand) -> None:
        if self.features is not None and not self.features.coaching_enabled:
            return
        logger.info(
            "coaching requested session=%s target=%s type=%s "
            "messageKey=%s reason=%s",
            command.session_id,
            command.target_user_id,
            command.coaching_type,
            command.message_key,
            command.reason_code,
        )
        try:
            self._commands.put_nowait(
                _QueuedCoaching(
                    command=command,
                    transcript_context=(
                        self.aggregator.state.transcript_buffer.ordered_segments()
                    ),
                )
            )
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
        parsed = parse_stt_event(event)
        async with self._lock:
            accepted = self.aggregator.push_stt_event(parsed)
            if (
                accepted
                and isinstance(parsed, TranscriptFinalizedEvent)
                and self._settings.transcript_debug_log
            ):
                speaker = self.aggregator.state.speaker(parsed.user_id)
                buffer = self.aggregator.state.transcript_buffer
                logger.info(
                    "transcript stored session=%s user=%s "
                    "utteranceId=%s startMs=%d endMs=%d confidence=%.2f "
                    "userSegments=%d sessionSegments=%d text=%r",
                    parsed.session_id,
                    parsed.user_id,
                    parsed.utterance_id,
                    parsed.payload.segment_start_ms,
                    parsed.payload.segment_end_ms,
                    parsed.confidence,
                    len(speaker.utterances),
                    buffer.segment_count,
                    parsed.payload.text,
                )
            return accepted

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
            parsed = (
                batch
                if isinstance(batch, VisionEventBatch)
                else VisionEventBatch.model_validate(batch)
            )
            result = self.aggregator.push_vision_batch(parsed)
            accepted = set(result.accepted_event_ids)
            for event in parsed.behavior_events:
                if (
                    event.event_id not in accepted
                    or event.event_type
                    not in IMPORTANT_VISION_BEHAVIOR_TYPES
                ):
                    continue
                participant = self.participants.get(event.user_id)
                if participant is None or not participant.vision_enabled:
                    continue
                try:
                    self._vision_events.put_nowait(
                        (event, participant.participant_identity)
                    )
                except asyncio.QueueFull:
                    logger.error(
                        "vision delivery queue full; dropped eventId=%s",
                        event.event_id,
                    )
            return result

    async def wait_until_delivered(self) -> None:
        await asyncio.gather(
            self._commands.join(),
            self._vision_events.join(),
        )

    async def stop(self) -> None:
        if self._audio_adapter is not None:
            await self._audio_adapter.stop()
        self.aggregator.state.session_active = False
        if self._tick_task is not None:
            self._tick_task.cancel()
            await asyncio.gather(self._tick_task, return_exceptions=True)
        try:
            await asyncio.wait_for(
                asyncio.gather(
                    self._commands.join(),
                    self._vision_events.join(),
                ),
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
        if self._vision_delivery_task is not None:
            self._vision_delivery_task.cancel()
            await asyncio.gather(
                self._vision_delivery_task,
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
        contextual_cache: dict[tuple[str, int, str], str | None] = {}
        while True:
            queued = await self._commands.get()
            command = queued.command
            try:
                if command.coaching_type == "SILENCE_RECOVERY":
                    cache_key = (
                        command.coaching_type,
                        command.triggered_at_session_elapsed_ms,
                        command.target_user_id or "",
                    )
                    if cache_key in contextual_cache:
                        message_text = contextual_cache[cache_key]
                    else:
                        message_text = await self._generate_contextual_message(
                            command,
                            queued.transcript_context,
                        )
                        contextual_cache[cache_key] = message_text
                    if message_text is not None:
                        command = command.model_copy(
                            update={"message_text": message_text}
                        )
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

    async def _generate_contextual_message(
        self,
        command: CoachingCommand,
        segments: tuple[TranscriptSegment, ...],
    ) -> str | None:
        if not self._settings.coaching_llm_configured or not segments:
            return None
        logger.info(
            "llm request started session=%s type=%s contextSegments=%d",
            command.session_id,
            command.coaching_type,
            min(
                len(segments),
                self._settings.coaching_llm_max_context_utterances,
            ),
        )
        try:
            if command.target_user_id is None:
                return None
            message = await self._message_generator.generate(
                segments,
                command.target_user_id,
            )
        except ContextualCoachingError as error:
            logger.warning(
                "llm fallback session=%s type=%s reason=%s",
                command.session_id,
                command.coaching_type,
                type(error).__name__,
            )
            return None
        except Exception:
            logger.exception(
                "llm fallback session=%s type=%s reason=UNEXPECTED_ERROR",
                command.session_id,
                command.coaching_type,
            )
            return None
        if message is None:
            logger.info(
                "llm fallback session=%s type=%s reason=EMPTY_CONTEXT",
                command.session_id,
                command.coaching_type,
            )
            return None
        logger.info(
            "llm response accepted session=%s type=%s characters=%d",
            command.session_id,
            command.coaching_type,
            len(message),
        )
        return message

    async def _vision_delivery_loop(self) -> None:
        while True:
            event, participant_identity = await self._vision_events.get()
            try:
                receipt = await self._vision_sender.send(
                    event,
                    participant_identity,
                )
                logger.info(
                    "vision receipt eventId=%s type=%s status=%s",
                    receipt.event_id,
                    event.event_type,
                    receipt.status,
                )
            except BackendVisionDeliveryError:
                logger.exception(
                    "vision delivery failed eventId=%s type=%s",
                    event.event_id,
                    event.event_type,
                )
            except Exception:
                logger.exception(
                    "unexpected vision worker error eventId=%s type=%s",
                    event.event_id,
                    event.event_type,
                )
            finally:
                self._vision_events.task_done()


class SessionManager:
    """Validate lifecycle events and keep the active runtime registry."""

    def __init__(
        self,
        settings: IntegrationSettings,
        *,
        sender: CoachingSender | None = None,
        vision_sender: VisionAnalysisSender | None = None,
        audio_adapter_factory: SessionAudioAdapterFactory | None = None,
        message_generator: CoachingMessageGenerator | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.settings = settings
        self._sender = sender or BackendCoachingClient(settings)
        self._vision_sender = vision_sender or BackendVisionClient(settings)
        self._message_generator = message_generator or ExaoneCoachingClient(
            settings
        )
        self._audio_adapter_factory = (
            audio_adapter_factory or LiveKitSttAdapterFactory(settings)
        )
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._sessions: dict[str, SessionRuntime] = {}
        self._processed_event_ids: set[str] = set()
        self._processed_event_order: deque[str] = deque()
        self._lifecycle_lock = asyncio.Lock()
        self._retained_transcripts: dict[str, RetainedTranscript] = {}
        self._retention_task: asyncio.Task[None] | None = None
        self._started = False

    @property
    def active_session_count(self) -> int:
        return len(self._sessions)

    @property
    def retained_transcript_count(self) -> int:
        self._purge_expired_transcripts()
        return len(self._retained_transcripts)

    def retained_transcript(
        self,
        session_id: str,
    ) -> RetainedTranscript | None:
        """Future report/reporting adapters can read a live TTL snapshot."""
        self._purge_expired_transcripts()
        return self._retained_transcripts.get(session_id)

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
        self._retention_task = asyncio.create_task(
            self._retention_loop(),
            name="transcript-retention-cleanup",
        )

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
        self._retained_transcripts.pop(event.session_id, None)
        runtime = SessionRuntime(
            event,
            self.settings,
            self._sender,
            self._vision_sender,
            self._audio_adapter_factory,
            self._message_generator,
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
        if event.ended_at.tzinfo is None:
            raise SessionEventContractError(
                "endedAt must include a timezone"
            )
        runtime = self._sessions.pop(event.session_id, None)
        if runtime is not None:
            await runtime.stop()
            self._retain_transcript(runtime, event.ended_at)
        return "PROCESSED"

    def _retain_transcript(
        self,
        runtime: SessionRuntime,
        ended_at: datetime,
    ) -> None:
        buffer = runtime.aggregator.state.transcript_buffer
        segments = buffer.ordered_segments()
        if not segments:
            logger.info(
                "transcript retention skipped session=%s reason=empty",
                runtime.session_id,
            )
            return
        expires_at = self._now() + timedelta(
            seconds=self.settings.transcript_retention_seconds
        )
        retained = RetainedTranscript(
            session_id=runtime.session_id,
            ended_at=ended_at,
            expires_at=expires_at,
            segments=segments,
        )
        self._retained_transcripts[runtime.session_id] = retained
        logger.info(
            "transcript retained session=%s segments=%d characters=%d "
            "expiresAt=%s",
            runtime.session_id,
            retained.segment_count,
            retained.character_count,
            retained.expires_at.isoformat(),
        )
        if (
            self.settings.transcript_debug_log
            and self.settings.transcript_debug_full_on_session_end
        ):
            logger.info(
                "transcript completed session=%s\n%s",
                runtime.session_id,
                retained.render(),
            )

    def _purge_expired_transcripts(self) -> None:
        now = self._now()
        expired_session_ids = [
            session_id
            for session_id, retained in self._retained_transcripts.items()
            if retained.expires_at <= now
        ]
        for session_id in expired_session_ids:
            retained = self._retained_transcripts.pop(session_id)
            logger.info(
                "transcript expired and deleted session=%s segments=%d "
                "characters=%d",
                session_id,
                retained.segment_count,
                retained.character_count,
            )

    async def _retention_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(
                    self.settings.transcript_cleanup_interval_seconds
                )
                self._purge_expired_transcripts()
        except asyncio.CancelledError:
            raise

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
        if self._retention_task is not None:
            self._retention_task.cancel()
            await asyncio.gather(
                self._retention_task,
                return_exceptions=True,
            )
            self._retention_task = None
        if self._retained_transcripts:
            logger.info(
                "transcript memory cleared on shutdown sessions=%d",
                len(self._retained_transcripts),
            )
            self._retained_transcripts.clear()
        await self._sender.close()
        await self._vision_sender.close()
        await self._message_generator.close()
        await self._audio_adapter_factory.close()
