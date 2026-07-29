"""통제실(aggregator) — STT 신호를 실시간 분석 이벤트·코칭 명령으로 집계하는 엔진."""

from aggregator.aggregator import (
    AnalysisEmitter,
    CoachingEmitter,
    SessionAggregator,
    SttSequenceError,
    SttSessionMismatchError,
    VisionBatchIngestionResult,
    VisionSequenceError,
    VisionSessionMismatchError,
)
from aggregator.coaching import (
    COACHING_TEMPLATES,
    CoachingCommand,
    CoachingPolicy,
    CoachingPriority,
    CoachingType,
    noop_coaching,
)
from aggregator.coaching_candidates import CoachingCandidate
from aggregator.coaching_catalog import COACHING_MESSAGES
from aggregator.config import MvpCoachingConfig
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
from aggregator.state import (
    SessionState,
    SpeakerState,
    UserRuntimeState,
    Utterance,
    VisionUserState,
)
from aggregator.speech_events import STT_EVENT_ADAPTER, parse_stt_event
from aggregator.vision_events import (
    VisionBehaviorEvent,
    VisionEvent,
    VisionEventBatch,
    VisionMetricSnapshot,
)

__all__ = [
    "COACHING_TEMPLATES",
    "COACHING_MESSAGES",
    "AnalysisEmitter",
    "AnalysisEvent",
    "CoachingCommand",
    "CoachingCandidate",
    "CoachingEmitter",
    "CoachingPolicy",
    "CoachingPriority",
    "CoachingType",
    "Detector",
    "FillerDetected",
    "FillerDetector",
    "FillerPayload",
    "MvpCoachingConfig",
    "QuestionAsked",
    "QuestionDetector",
    "QuestionPayload",
    "SessionAggregator",
    "SessionState",
    "STT_EVENT_ADAPTER",
    "SttSequenceError",
    "SttSessionMismatchError",
    "SilenceDetected",
    "SilenceDetector",
    "SilencePayload",
    "SpeakerState",
    "Utterance",
    "UserRuntimeState",
    "VisionBatchIngestionResult",
    "VisionBehaviorEvent",
    "VisionEvent",
    "VisionEventBatch",
    "VisionMetricSnapshot",
    "VisionSequenceError",
    "VisionSessionMismatchError",
    "VisionUserState",
    "console_coaching_emit",
    "console_emit",
    "default_detectors",
    "noop_coaching",
    "parse_stt_event",
]
