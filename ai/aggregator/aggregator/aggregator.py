"""세션 집계기 — STT TranscriptEvent를 받아 감지 → 분석 이벤트 + 코칭 명령을 발행한다.

파이프라인(친구 리뷰 #3):
  전사 → 감지기(AnalysisEvent) → [분석 emit] → CoachingPolicy(게이트·쿨다운·TTL)
       → 통과 시 CoachingCommand → [코칭 emit]

분석 이벤트(무슨 일이 감지됐다)와 코칭 명령(사용자에게 전달하라)은 서로 다른 스트림이다.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

from stt.events import TranscriptEvent

from aggregator.coaching import CoachingCommand, CoachingPolicy, noop_coaching
from aggregator.detectors import Detector, default_detectors
from aggregator.events import AnalysisEvent
from aggregator.state import SessionState, Utterance

AnalysisEmitter = Callable[[AnalysisEvent], None]
CoachingEmitter = Callable[[CoachingCommand], None]


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
    ) -> None:
        self.state = SessionState(session_id=session_id)
        self._on_analysis = on_analysis
        self._on_coaching = on_coaching
        self.detectors: list[Detector] = (
            list(detectors) if detectors is not None else default_detectors()
        )
        self.policy = policy if policy is not None else CoachingPolicy()

    def _dispatch(self, events: list[AnalysisEvent]) -> None:
        for event in events:
            self._on_analysis(event)  # 분석 이벤트(#112·지표·디버깅)
            command = self.policy.evaluate(event, self.state)
            if command is not None:
                self._on_coaching(command)  # 코칭 명령(#114 개인 전달)

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

    def tick(self, now_ms: int) -> None:
        """시간 기반 감지(침묵 등)를 구동한다. now_ms = 세션 경과 시간."""
        for detector in self.detectors:
            self._dispatch(detector.on_tick(self.state, now_ms))
