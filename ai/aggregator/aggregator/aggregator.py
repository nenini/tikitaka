"""세션 집계기 — STT TranscriptEvent를 받아 감지 → 분석 이벤트 + 코칭 명령을 발행한다.

파이프라인(친구 리뷰 #3):
  전사 → 감지기(AnalysisEvent) → [분석 emit] → CoachingPolicy(게이트·쿨다운·TTL)
       → 통과 시 CoachingCommand → [코칭 emit]

분석 이벤트(무슨 일이 감지됐다)와 코칭 명령(사용자에게 전달하라)은 서로 다른 스트림이다.
"""

from __future__ import annotations

import logging
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from uuid import UUID

from stt.events import (
    SpeechEndedEvent,
    SpeechStartedEvent,
    SttEvent,
    TranscriptFinalizedEvent,
)

from aggregator.coaching import CoachingCommand, CoachingPolicy, noop_coaching
from aggregator.coaching_arbitrator import CoachingArbitrator
from aggregator.coaching_candidates import CoachingCandidate
from aggregator.coaching_detectors import (
    AttentionCoachingDetector,
    ConversationCoachingDetector,
    SmileCoachingDetector,
    VisionSetupCoachingDetector,
)
from aggregator.config import MvpCoachingConfig
from aggregator.detectors import Detector, default_detectors
from aggregator.events import AnalysisEvent, SilenceDetected
from aggregator.state import SessionState
from aggregator.speech_events import parse_stt_event
from aggregator.transcripts import TranscriptSegment
from aggregator.vision_events import (
    VISION_EVENT_ADAPTER,
    VisionBehaviorEventBase,
    VisionEvent,
    VisionEventBatch,
    VisionMetricSnapshot,
)

logger = logging.getLogger(__name__)

AnalysisEmitter = Callable[[AnalysisEvent], None]
CoachingEmitter = Callable[[CoachingCommand], None]

_VISION_DEDUPE_CAPACITY = 4096
_STT_DEDUPE_CAPACITY = 4096


@dataclass
class VisionBatchIngestionResult:
    accepted_event_ids: list[UUID] = field(default_factory=list)
    duplicate_event_ids: list[UUID] = field(default_factory=list)
    stale_event_ids: list[UUID] = field(default_factory=list)


class VisionSessionMismatchError(ValueError):
    """An event was delivered to the wrong session aggregator."""


class VisionSequenceError(ValueError):
    """A client instance sent a sequence number that did not advance."""


class SttSessionMismatchError(ValueError):
    """An STT event was delivered to the wrong session aggregator."""


class SttSequenceError(ValueError):
    """An STT client instance sent a sequence number that did not advance."""


class SessionAggregator:
    """한 세션의 상태·감지기·코칭 정책을 보유하고 두 스트림을 발행한다."""

    def __init__(
        self,
        session_id: str,
        *,
        on_analysis: AnalysisEmitter,
        on_coaching: CoachingEmitter = noop_coaching,
        detectors: Sequence[Detector] | None = None,
        policy: CoachingPolicy | None = None,
        config: MvpCoachingConfig | None = None,
        participant_user_ids: Sequence[str] | None = None,
    ) -> None:
        self.state = SessionState(session_id=session_id)
        self.state.register_participants(list(participant_user_ids or ()))
        self._on_analysis = on_analysis
        self._on_coaching = on_coaching
        self.detectors: list[Detector] = (
            list(detectors) if detectors is not None else default_detectors()
        )
        self.config = (
            config
            if config is not None
            else (policy.config if policy is not None else MvpCoachingConfig())
        )
        self.policy = (
            policy if policy is not None else CoachingPolicy(config=self.config)
        )
        self._attention_detector = AttentionCoachingDetector(self.config)
        self._conversation_detector = ConversationCoachingDetector(self.config)
        self._vision_setup_detector = VisionSetupCoachingDetector(self.config)
        self._smile_detector = SmileCoachingDetector(self.config)
        self._coaching_arbitrator = CoachingArbitrator()
        self._vision_event_ids: set[UUID] = set()
        self._vision_event_id_order: deque[UUID] = deque()
        self._vision_last_seq: dict[tuple[str, UUID], int] = {}
        self._stt_event_ids: set[str] = set()
        self._stt_event_id_order: deque[str] = deque()
        self._stt_last_seq: dict[tuple[str, str], int] = {}

    def _dispatch(self, events: list[AnalysisEvent]) -> None:
        for event in events:
            self._on_analysis(event)  # 분석 이벤트(#112·지표·디버깅)
            command = self.policy.evaluate(event, self.state)
            if command is not None:
                self._on_coaching(command)  # 코칭 명령(#114 개인 전달)

    def _dispatch_candidates(
        self,
        candidates: list[CoachingCandidate],
    ) -> None:
        for candidate in candidates:
            command = self.policy.evaluate_candidate(candidate, self.state)
            if command is not None:
                self._on_coaching(command)

    def push_stt_event(
        self,
        event: SttEvent | Mapping[str, object],
    ) -> bool:
        """Validate and apply one STT v2 event."""
        parsed = parse_stt_event(event)
        if parsed.session_id != self.state.session_id:
            raise SttSessionMismatchError(
                f"STT event session {parsed.session_id!r} does not match "
                f"aggregator session {self.state.session_id!r}"
            )
        if parsed.event_id in self._stt_event_ids:
            return False

        sequence_key = (parsed.user_id, parsed.client_instance_id)
        previous_seq = self._stt_last_seq.get(sequence_key)
        if previous_seq is not None and parsed.seq <= previous_seq:
            # **역행을 예외로 막지 않는다.** seq 발급은 단조지만 전달 순서는 구조적으로
            # 보장되지 않는다 — SPEECH는 feed() 반환값으로 즉시 나가고 TRANSCRIPT는
            # worker 큐를 거쳐 poll(50ms)로 나온다. 생산자와 경로가 둘이라 발급 1·2·4·5가
            # 먼저 가고 3이 나중에 오는 일이 정상적으로 생긴다(실측).
            #
            # 예전엔 여기서 예외를 던졌고 그 대가가 너무 컸다: poll 루프가 죽어 전사가
            # 쌓이고, 종료 처리가 중단돼 전사 보관·리포트·실패통지가 통째로 날아갔다
            # (2026-08-06 운영 세션 2건). 순서는 신호일 뿐 정합성 게이트가 아니다.
            # 중복은 event_id 로 이미 막는다.
            logger.warning(
                "STT seq out of order session=%s user=%s received=%d previous=%d "
                "type=%s — 이벤트는 그대로 처리한다",
                parsed.session_id,
                parsed.user_id,
                parsed.seq,
                previous_seq,
                parsed.event_type,
            )

        user = self.state.user(parsed.user_id)
        if isinstance(parsed, SpeechStartedEvent):
            user.is_speaking = True
            user.current_utterance_id = UUID(parsed.utterance_id)
            user.speech_started_at_ms = (
                parsed.payload.observed_start_elapsed_ms
            )
            user.last_speech_started_at_ms = (
                parsed.payload.observed_start_elapsed_ms
            )
            self.state.last_activity_ms = max(
                self.state.last_activity_ms,
                parsed.payload.observed_start_elapsed_ms,
            )
        elif isinstance(parsed, SpeechEndedEvent):
            user.is_speaking = False
            user.current_utterance_id = None
            user.speech_started_at_ms = None
            user.last_speech_ended_at_ms = (
                parsed.payload.observed_end_elapsed_ms
            )
            self.state.last_activity_ms = max(
                self.state.last_activity_ms,
                parsed.payload.observed_end_elapsed_ms,
            )
        else:
            self._apply_transcript(parsed)

        # 최댓값을 유지한다. 늦게 온 낮은 seq 로 기준을 내리면 그 뒤 정상 이벤트가
        # 전부 역행으로 보여 로그가 도배된다.
        self._stt_last_seq[sequence_key] = max(
            parsed.seq, previous_seq if previous_seq is not None else parsed.seq
        )
        self._remember_stt_event_id(parsed.event_id)
        return True

    def push_transcript(self, event: TranscriptFinalizedEvent) -> None:
        """Compatibility entry point for finalized STT v2 transcripts."""
        self.push_stt_event(event)

    def _apply_transcript(self, event: TranscriptFinalizedEvent) -> None:
        """Store a finalized transcript and run content detectors."""
        utterance = TranscriptSegment(
            event_id=event.event_id,
            utterance_id=event.utterance_id,
            session_id=event.session_id,
            user_id=event.user_id,
            participant_identity=event.participant_identity,
            client_instance_id=event.client_instance_id,
            seq=event.seq,
            start_ms=event.payload.segment_start_ms,
            end_ms=event.payload.segment_end_ms,
            text=event.payload.text,
            confidence=event.confidence,
            language=event.payload.language,
            occurred_at=event.occurred_at,
        )
        self.state.add_utterance(utterance)
        self._conversation_detector.on_utterance(self.state, utterance)
        for detector in self.detectors:
            self._dispatch(detector.on_utterance(self.state, utterance))

    def _remember_stt_event_id(self, event_id: str) -> None:
        self._stt_event_ids.add(event_id)
        self._stt_event_id_order.append(event_id)
        if len(self._stt_event_id_order) > _STT_DEDUPE_CAPACITY:
            expired = self._stt_event_id_order.popleft()
            self._stt_event_ids.discard(expired)

    def push_vision_event(
        self,
        event: VisionEvent | Mapping[str, object],
    ) -> bool:
        """Validate and store one Vision v4 event without coaching."""
        parsed = (
            event
            if isinstance(event, (VisionBehaviorEventBase, VisionMetricSnapshot))
            else VISION_EVENT_ADAPTER.validate_python(event)
        )
        if parsed.session_id != self.state.session_id:
            raise VisionSessionMismatchError(
                f"Vision event session {parsed.session_id!r} does not match "
                f"aggregator session {self.state.session_id!r}"
            )
        if parsed.event_id in self._vision_event_ids:
            return False

        sequence_key = (parsed.user_id, parsed.client_instance_id)
        previous_seq = self._vision_last_seq.get(sequence_key)
        if previous_seq is not None and parsed.seq <= previous_seq:
            raise VisionSequenceError(
                "Vision seq must increase for one user/client instance: "
                f"received {parsed.seq}, previous {previous_seq}"
            )

        if isinstance(parsed, VisionMetricSnapshot):
            self.state.apply_vision_metric(parsed)
            self._smile_detector.on_metric(self.state, parsed)
        else:
            self.state.apply_vision_behavior(parsed)
            self._dispatch_candidates(
                self._vision_setup_detector.on_vision_event(self.state, parsed)
            )
            self._dispatch_candidates(
                self._attention_detector.on_vision_event(self.state, parsed)
            )

        self._vision_last_seq[sequence_key] = parsed.seq
        self._remember_vision_event_id(parsed.event_id)
        return True

    def push_vision_batch(
        self,
        batch: VisionEventBatch | Mapping[str, object],
    ) -> VisionBatchIngestionResult:
        """Validate a TS batch, restore seq order, and ingest each event."""
        parsed = (
            batch
            if isinstance(batch, VisionEventBatch)
            else VisionEventBatch.model_validate(batch)
        )
        ordered_events = parsed.ordered_events()
        for event in ordered_events:
            if event.session_id != self.state.session_id:
                raise VisionSessionMismatchError(
                    f"Vision event session {event.session_id!r} does not match "
                    f"aggregator session {self.state.session_id!r}"
                )

        result = VisionBatchIngestionResult()
        seen_batch_event_ids: set[UUID] = set()
        seen_batch_sequences: set[tuple[str, UUID, int]] = set()
        for event in ordered_events:
            if (
                event.event_id in self._vision_event_ids
                or event.event_id in seen_batch_event_ids
            ):
                result.duplicate_event_ids.append(event.event_id)
                continue
            seen_batch_event_ids.add(event.event_id)
            sequence_key = (event.user_id, event.client_instance_id, event.seq)
            if sequence_key in seen_batch_sequences:
                result.stale_event_ids.append(event.event_id)
                continue
            seen_batch_sequences.add(sequence_key)
            try:
                accepted = self.push_vision_event(event)
            except VisionSequenceError:
                result.stale_event_ids.append(event.event_id)
                continue
            if accepted:
                result.accepted_event_ids.append(event.event_id)
        return result

    def _remember_vision_event_id(self, event_id: UUID) -> None:
        self._vision_event_ids.add(event_id)
        self._vision_event_id_order.append(event_id)
        if len(self._vision_event_id_order) > _VISION_DEDUPE_CAPACITY:
            expired = self._vision_event_id_order.popleft()
            self._vision_event_ids.discard(expired)

    def tick(self, now_ms: int) -> None:
        """시간 기반 감지(침묵 등)를 구동한다. now_ms = 세션 경과 시간."""
        candidates: list[CoachingCandidate] = []
        for detector in self.detectors:
            events = detector.on_tick(self.state, now_ms)
            for event in events:
                self._on_analysis(event)
                if isinstance(event, SilenceDetected):
                    target_user_id = self._silence_coaching_target()
                    if target_user_id is not None:
                        candidates.append(
                            CoachingCandidate(
                                coaching_type="SILENCE_RECOVERY",
                                target_user_id=target_user_id,
                                message_key="SILENCE_RECOVERY_01",
                                reason_code="LONG_SILENCE",
                                triggered_at_ms=event.session_elapsed_ms,
                                trigger_id=f"{event.event_id}:{target_user_id}",
                                priority="LOW",
                            )
                        )
        candidates.extend(
            self._conversation_detector.on_tick(self.state, now_ms)
        )
        candidates.extend(
            self._vision_setup_detector.on_tick(self.state, now_ms)
        )
        candidates.extend(self._smile_detector.on_tick(self.state, now_ms))
        self._dispatch_candidates(
            self._coaching_arbitrator.select(candidates)
        )

    def _silence_coaching_target(self) -> str | None:
        """Return the counterpart of the most recent finalized speaker.

        Silence coaching must not ask the person who just spoke to carry the
        conversation again. The dating session contract has two participants,
        so the other registered participant is the single coaching target.
        If either side cannot be identified, it is safer to emit no coaching.
        """
        segments = self.state.transcript_buffer.ordered_segments()
        if not segments:
            return None
        last_speaker_id = segments[-1].user_id
        return next(
            (
                user_id
                for user_id in self.state.participant_user_ids
                if user_id != last_speaker_id
            ),
            None,
        )

    def tick_vision(self, now_ms: int) -> None:
        """Advance only coaching rules that depend on Vision observations.

        A browser Vision packet is not an authoritative speech clock. Running
        the full tick from that packet can make its client-side elapsed time
        wake STT silence/long-talk rules immediately. The session runtime's
        own clock remains responsible for ``tick``; Vision transports use
        this narrower entry point.
        """
        candidates: list[CoachingCandidate] = []
        candidates.extend(
            self._vision_setup_detector.on_tick(self.state, now_ms)
        )
        candidates.extend(self._smile_detector.on_tick(self.state, now_ms))
        self._dispatch_candidates(
            self._coaching_arbitrator.select(candidates)
        )
