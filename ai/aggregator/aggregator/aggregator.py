"""세션 집계기 — STT TranscriptEvent를 받아 감지 → 분석 이벤트 + 코칭 명령을 발행한다.

파이프라인(친구 리뷰 #3):
  전사 → 감지기(AnalysisEvent) → [분석 emit] → CoachingPolicy(게이트·쿨다운·TTL)
       → 통과 시 CoachingCommand → [코칭 emit]

분석 이벤트(무슨 일이 감지됐다)와 코칭 명령(사용자에게 전달하라)은 서로 다른 스트림이다.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from uuid import UUID

from stt.events import TranscriptEvent

from aggregator.coaching import CoachingCommand, CoachingPolicy, noop_coaching
from aggregator.coaching_candidates import CoachingCandidate
from aggregator.coaching_detectors import (
    AttentionCoachingDetector,
    VisionSetupCoachingDetector,
)
from aggregator.config import MvpCoachingConfig
from aggregator.detectors import Detector, default_detectors
from aggregator.events import AnalysisEvent
from aggregator.state import SessionState, Utterance
from aggregator.vision_events import (
    VISION_EVENT_ADAPTER,
    VisionBehaviorEventBase,
    VisionEvent,
    VisionEventBatch,
    VisionMetricSnapshot,
)

AnalysisEmitter = Callable[[AnalysisEvent], None]
CoachingEmitter = Callable[[CoachingCommand], None]

_VISION_DEDUPE_CAPACITY = 4096


@dataclass
class VisionBatchIngestionResult:
    accepted_event_ids: list[UUID] = field(default_factory=list)
    duplicate_event_ids: list[UUID] = field(default_factory=list)
    stale_event_ids: list[UUID] = field(default_factory=list)


class VisionSessionMismatchError(ValueError):
    """An event was delivered to the wrong session aggregator."""


class VisionSequenceError(ValueError):
    """A client instance sent a sequence number that did not advance."""


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
    ) -> None:
        self.state = SessionState(session_id=session_id)
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
        self._vision_setup_detector = VisionSetupCoachingDetector(self.config)
        self._vision_event_ids: set[UUID] = set()
        self._vision_event_id_order: deque[UUID] = deque()
        self._vision_last_seq: dict[tuple[str, UUID], int] = {}

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

    def push_transcript(self, event: TranscriptEvent) -> None:
        """STT 전사 이벤트를 상태에 반영하고 내용 기반 감지기를 돌린다."""
        utterance = Utterance(
            speaker_id=event.speaker_id,
            start_ms=event.payload.segment_start_ms,
            end_ms=event.payload.segment_end_ms,
            text=event.payload.text,
        )
        self.state.add_utterance(utterance)
        for detector in self.detectors:
            self._dispatch(detector.on_utterance(self.state, utterance))

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
        for detector in self.detectors:
            self._dispatch(detector.on_tick(self.state, now_ms))
        self._dispatch_candidates(
            self._vision_setup_detector.on_tick(self.state, now_ms)
        )
