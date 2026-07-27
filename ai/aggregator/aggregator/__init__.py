"""통제실(aggregator) — STT 신호를 실시간 분석 이벤트·코칭 명령으로 집계하는 엔진."""

from aggregator.aggregator import AnalysisEmitter, CoachingEmitter, SessionAggregator
from aggregator.coaching import (
    COACHING_TEMPLATES,
    CoachingCommand,
    CoachingPolicy,
    CoachingPriority,
    CoachingType,
    noop_coaching,
)
from aggregator.console_sink import console_coaching_emit, console_emit
from aggregator.detectors import (
    Detector,
    FillerDetector,
    QuestionDetector,
    SilenceDetector,
    default_detectors,
)
from aggregator.events import (
    AnalysisEvent,
    FillerDetected,
    FillerPayload,
    QuestionAsked,
    QuestionPayload,
    SilenceDetected,
    SilencePayload,
)
from aggregator.state import SessionState, SpeakerState, Utterance

__all__ = [
    "COACHING_TEMPLATES",
    "AnalysisEmitter",
    "AnalysisEvent",
    "CoachingCommand",
    "CoachingEmitter",
    "CoachingPolicy",
    "CoachingPriority",
    "CoachingType",
    "Detector",
    "FillerDetected",
    "FillerDetector",
    "FillerPayload",
    "QuestionAsked",
    "QuestionDetector",
    "QuestionPayload",
    "SessionAggregator",
    "SessionState",
    "SilenceDetected",
    "SilenceDetector",
    "SilencePayload",
    "SpeakerState",
    "Utterance",
    "console_coaching_emit",
    "console_emit",
    "default_detectors",
    "noop_coaching",
]
