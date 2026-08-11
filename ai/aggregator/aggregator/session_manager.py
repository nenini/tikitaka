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
from aggregator.report import (
    ReportInput,
    ReportPublisher,
    build_report_input,
    generator_from_settings,
    run_report_job,
)
from aggregator.report.builder import ReportLlmError
from aggregator.session_contracts import (
    SessionEventRequest,
    SessionEventResponse,
)
from aggregator.speech_events import parse_stt_event
from aggregator.settings import IntegrationSettings
from aggregator.task_guard import log_task_failure
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

    async def request_question_suggestion(
        self,
        target_user_id: str,
        request_id: str,
    ) -> bool:
        """사용자가 버튼으로 요청한 질문 추천. 만들었으면 True.

        **`CoachingPolicy` 를 타지 않는다.** 쿨다운·중복은 AI 가 판단할 일이 아니라
        사용자가 이미 결정한 것이다. 연타는 FE 가 요청 중 버튼을 잠가 막는다.

        문구를 만들지 못하면 **코칭을 보내지 않고 False** 를 돌려준다. 자동 코칭처럼
        고정 문구로 폴백하면, 질문을 요청한 사람에게 엉뚱한 격려가 가서 버튼이 고장 난
        것처럼 보인다. 발화가 아직 없을 때(`generate` 가 None)도 같은 경로다.
        """
        segments = self.aggregator.state.transcript_buffer.ordered_segments()
        message_text = await self._generate_question(segments, target_user_id)
        if message_text is None:
            return False

        elapsed = self.elapsed_ms()
        self._on_coaching(
            CoachingCommand(
                session_id=self.session_id,
                target_user_id=target_user_id,
                coaching_type="QUESTION_SUGGESTION",
                message_key="QUESTION_SUGGESTION_01",
                priority="MEDIUM",
                reason_code="USER_REQUESTED",
                triggered_at_session_elapsed_ms=elapsed,
                expires_at_session_elapsed_ms=(
                    elapsed + self.aggregator.config.coaching_ttl_ms
                ),
                # 자동 코칭과 절대 겹치지 않게 접두사를 둔다 — 겹치면 BE 중복 차단에 걸린다.
                deduplication_key=f"manual:{request_id}",
                message_text=message_text,
            )
        )
        return True

    async def _generate_question(
        self,
        segments: tuple[TranscriptSegment, ...],
        target_user_id: str,
    ) -> str | None:
        if not self._settings.coaching_llm_configured or not segments:
            return None
        try:
            return await self._message_generator.generate(segments, target_user_id)
        except ContextualCoachingError as error:
            logger.info(
                "question suggestion rejected session=%s reason=%s",
                self.session_id,
                type(error).__name__,
            )
            return None
        except Exception:
            logger.exception(
                "question suggestion failed session=%s",
                self.session_id,
            )
            return None

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
                self.elapsed_ms() if now_ms is None else now_ms,
                awaiting_transcripts=self._awaiting_transcripts(),
            )

    def _awaiting_transcripts(self) -> int:
        """전사 대기 중인 발화 수. 어댑터가 없으면(설정 미비·테스트) 0 이다."""
        adapter = self._audio_adapter
        return 0 if adapter is None else adapter.pending_transcripts

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
        """감지기 tick. **한 번 실패했다고 루프를 끝내지 않는다.**

        예전엔 try 가 while 바깥이라 예외 하나에 tick 이 영영 멈췄다. tick 이 멈추면
        침묵·리액션 감지가 통째로 죽어 세션 내내 코칭이 한 건도 안 나간다 — 로그는
        남지만 사용자는 "코칭이 원래 이런가 보다" 하고 넘어간다.
        """
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "aggregator tick failed session=%s — 루프는 계속한다",
                    self.session_id,
                )
            await asyncio.sleep(self._settings.tick_interval_seconds)

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
        report_publisher: ReportPublisher | None = None,
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
        self._processed_events: dict[str, str] = {}
        """event_id → 그 이벤트의 발생 시각. 값까지 같아야 재시도로 본다(_is_replay 참고)."""
        self._processed_event_order: deque[str] = deque()
        self._lifecycle_lock = asyncio.Lock()
        self._retained_transcripts: dict[str, RetainedTranscript] = {}
        self._retention_task: asyncio.Task[None] | None = None
        self._report_publisher = report_publisher
        self._report_tasks: set[asyncio.Task[None]] = set()
        self._warmup_tasks: set[asyncio.Task[None]] = set()
        self._report_semaphore = asyncio.Semaphore(
            settings.report_max_concurrency
        )
        self._started = False

    @property
    def active_session_count(self) -> int:
        return len(self._sessions)

    @property
    def retained_transcript_count(self) -> int:
        self._purge_expired_transcripts()
        return len(self._retained_transcripts)

    @property
    def pending_report_count(self) -> int:
        return len(self._report_tasks)

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
            if self._is_replay(event):
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
            self._remember(event)
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
        self._warm_coaching_llm()
        return "PROCESSED"

    def _warm_coaching_llm(self) -> None:
        """코칭 모델을 미리 올려 둔다. 세션 시작을 막지 않게 백그라운드로.

        Ollama가 5분 유휴면 모델을 내리고, 그 뒤 첫 요청은 4.7초가 걸려 코칭
        타임아웃(3초)을 넘긴다(실측). 하필 **세션 시작 직후 첫 코칭**이 그 경우라
        가장 눈에 띄는 자리에서 폴백이 난다.
        """
        if self._message_generator is None:
            return
        task = asyncio.create_task(
            self._message_generator.warmup(), name="coaching-warmup"
        )
        self._warmup_tasks.add(task)
        task.add_done_callback(self._warmup_tasks.discard)
        # discard 만 붙이면 예외가 회수돼 버려져 흔적이 안 남는다.
        task.add_done_callback(log_task_failure)

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
            # stop() 안에서 뭐가 터지든 **전사 보관과 리포트는 반드시 시도한다.**
            # 예전엔 stop() 예외가 그대로 올라가 아래 두 줄이 통째로 스킵됐고,
            # 세션 결과물이 전부 사라졌다(2026-08-06 운영 2건). 세션은 이미 끝났으니
            # 남은 데이터를 건지는 게 예외를 위로 던지는 것보다 중요하다.
            try:
                await runtime.stop()
            except Exception:  # noqa: BLE001
                logger.exception(
                    "session stop failed session=%s — 남은 데이터는 계속 처리한다",
                    event.session_id,
                )
            self._retain_transcript(runtime, event.ended_at)
            self._schedule_report(runtime, event.ended_at)
        return "PROCESSED"

    def _schedule_report(
        self,
        runtime: SessionRuntime,
        ended_at: datetime,
    ) -> None:
        """Freeze session state and enqueue one non-blocking report task."""
        try:
            session_id = int(runtime.session_id)
            user_ids = {
                user_id: int(user_id)
                for user_id in runtime.participants
            }
        except ValueError:
            logger.warning(
                "report skipped session=%s reason=non-numeric identity",
                runtime.session_id,
            )
            return
        if len(user_ids) != len(runtime.participants):
            logger.warning(
                "report skipped session=%s reason=incomplete participants",
                runtime.session_id,
            )
            return

        duration_ms = int(
            (ended_at - runtime.actual_start_at).total_seconds() * 1000
        )
        vision_enabled = (
            runtime.features is None
            or runtime.features.vision_enabled
        )
        snapshot = build_report_input(
            runtime.aggregator.state,
            session_duration_ms=max(0, duration_ms),
            vision_enabled=vision_enabled,
            practice_goals={
                user_id: tuple(participant.practice_goals)
                for user_id, participant in runtime.participants.items()
            },
        )
        task = asyncio.create_task(
            self._run_report(snapshot, session_id, user_ids, ended_at),
            name=f"report-{runtime.session_id}",
        )
        self._report_tasks.add(task)
        task.add_done_callback(self._report_done)
        logger.info(
            "report scheduled session=%s pending=%d",
            runtime.session_id,
            len(self._report_tasks),
        )

    def _report_done(self, task: asyncio.Task[None]) -> None:
        self._report_tasks.discard(task)
        if task.cancelled():
            logger.warning("report task cancelled name=%s", task.get_name())
            return
        error = task.exception()
        if error is not None:
            logger.error(
                "unexpected report task failure name=%s",
                task.get_name(),
                exc_info=(type(error), error, error.__traceback__),
            )

    async def _run_report(
        self,
        snapshot: ReportInput,
        session_id: int,
        user_ids: dict[str, int],
        ended_at: datetime,
    ) -> None:
        async with self._report_semaphore:
            if self._report_publisher is None:
                self._report_publisher = ReportPublisher(self.settings)
            try:
                generator = generator_from_settings(self.settings)
            except ReportLlmError:
                generator = None
            await run_report_job(
                snapshot,
                session_id=session_id,
                user_ids=user_ids,
                analyzed_at=ended_at.isoformat(),
                publisher=self._report_publisher,
                generator=generator,
            )

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
        """보관 기간이 지난 전사를 지운다.

        **CancelledError 말고 다른 예외도 잡아야 한다.** 예전엔 안 잡아서 한 번 터지면
        루프가 조용히 죽었고(아무도 이 태스크의 예외를 안 본다), 그러면 전사가
        **영원히 안 지워진다** — 메모리도 문제지만 "종료 후 30분만 보관"이라는
        개인정보 약속이 깨지는 게 더 크다.
        """
        while True:
            try:
                await asyncio.sleep(
                    self.settings.transcript_cleanup_interval_seconds
                )
                self._purge_expired_transcripts()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "transcript retention sweep failed — 루프는 계속한다"
                )

    def runtime(self, session_id: str) -> SessionRuntime:
        try:
            return self._sessions[session_id]
        except KeyError as error:
            raise SessionNotActiveError(session_id) from error

    async def request_question_suggestion(
        self,
        session_id: str,
        target_user_id: str,
        request_id: str,
    ) -> bool:
        return await self.runtime(session_id).request_question_suggestion(
            target_user_id,
            request_id,
        )

    @staticmethod
    def _occurred_at(event: SessionEventRequest) -> str:
        """이벤트를 유일하게 만드는 시각. BE eventId 는 세션번호+종류뿐이라 이것까지 봐야 한다."""
        moment = event.actual_start_at or event.ended_at
        return moment.isoformat() if moment is not None else ""

    def _is_replay(self, event: SessionEventRequest) -> bool:
        """BE 재시도인가.

        ⚠️ eventId 만으로 판단하면 안 된다. BE 는 `session-{세션번호}-{종류}` 로만 만들어
        (`HttpAiSessionEventClient.eventId`) **세션번호가 재사용되면 문자열이 그대로 겹친다.**
        BE 를 재배포해 세션번호가 1번부터 다시 발급되면, 예전에 처리한 번호와 충돌한 새 세션이
        DUPLICATE 로 조용히 버려진다 — 관제실이 세션을 아예 안 들고 있게 되어 전사·코칭·리포트가
        전부 사라진다(2026-08-11 운영 1건: 리포트가 PENDING 에서 안 풀림).

        재시도는 **같은 이벤트 객체를 그대로 다시 보내므로** 시각이 바이트 단위로 같다.
        반면 번호를 재사용한 새 세션은 시각이 다르다. 그래서 시각까지 일치할 때만 재시도로 본다.
        """
        seen = self._processed_events.get(event.event_id)
        return seen is not None and seen == self._occurred_at(event)

    def _remember(self, event: SessionEventRequest) -> None:
        event_id = event.event_id
        if event_id not in self._processed_events:
            self._processed_event_order.append(event_id)
        self._processed_events[event_id] = self._occurred_at(event)
        if len(self._processed_event_order) > _PROCESSED_EVENT_CAPACITY:
            expired = self._processed_event_order.popleft()
            self._processed_events.pop(expired, None)

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
        if self._warmup_tasks:
            # 워밍업은 결과를 안 쓰므로 기다리지 않고 끊는다. 남겨 두면 종료 후
            # "Task was destroyed but it is pending" 경고가 뜬다.
            for task in tuple(self._warmup_tasks):
                task.cancel()
            await asyncio.gather(*self._warmup_tasks, return_exceptions=True)
            self._warmup_tasks.clear()
        await self._finish_report_tasks()
        if self._report_publisher is not None:
            await self._report_publisher.close()
            self._report_publisher = None
        await self._sender.close()
        await self._vision_sender.close()
        await self._message_generator.close()
        await self._audio_adapter_factory.close()

    async def _finish_report_tasks(self) -> None:
        tasks = tuple(self._report_tasks)
        if not tasks:
            return
        try:
            await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=self.settings.report_shutdown_timeout_seconds,
            )
        except TimeoutError:
            logger.warning(
                "report shutdown timeout pending=%d timeoutSeconds=%s",
                len(self._report_tasks),
                self.settings.report_shutdown_timeout_seconds,
            )
            for task in tuple(self._report_tasks):
                task.cancel()
            await asyncio.gather(
                *tuple(self._report_tasks),
                return_exceptions=True,
            )
