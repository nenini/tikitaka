"""VisionEvent v4 JSON contract received by the Session Aggregator.

The browser validates this contract with Zod. The aggregator validates the
same JSON again with Pydantic before allowing it into session state.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, TypeAlias
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    TypeAdapter,
    model_validator,
)
from pydantic.alias_generators import to_camel

UnitScore = Annotated[float, Field(strict=True, ge=0, le=1)]
NonNegativeFloat = Annotated[float, Field(strict=True, ge=0)]
PositiveFloat = Annotated[float, Field(strict=True, gt=0)]
PositiveSeq = Annotated[
    int,
    Field(strict=True, gt=0, le=9_007_199_254_740_991),
]


class _ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        allow_inf_nan=False,
    )


class VisionBaselineMode(StrEnum):
    PERSONALIZED = "PERSONALIZED"
    MONOCULAR_LEFT = "MONOCULAR_LEFT"
    MONOCULAR_RIGHT = "MONOCULAR_RIGHT"
    COLLECTING = "COLLECTING"
    GLOBAL_FALLBACK = "GLOBAL_FALLBACK"
    UNAVAILABLE = "UNAVAILABLE"
    BASELINE_UNCERTAIN = "BASELINE_UNCERTAIN"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class DetectorName(StrEnum):
    FACE_QUALITY = "FACE_QUALITY"
    SCREEN_ATTENTION = "SCREEN_ATTENTION"
    SMILE_EXPRESSION = "SMILE_EXPRESSION"
    EXPRESSION_ACTIVITY = "EXPRESSION_ACTIVITY"
    NOD = "NOD"


class FaceQualityReason(StrEnum):
    CAMERA_DISABLED = "CAMERA_DISABLED"
    TRACK_ENDED = "TRACK_ENDED"
    FACE_MISSING = "FACE_MISSING"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    FACE_TOO_SMALL = "FACE_TOO_SMALL"
    FACE_TOO_LARGE = "FACE_TOO_LARGE"
    FACE_OUT_OF_FRAME = "FACE_OUT_OF_FRAME"
    LOW_LIGHT = "LOW_LIGHT"
    BACKLIGHT = "BACKLIGHT"
    SEVERE_BLUR = "SEVERE_BLUR"
    EXTREME_HEAD_POSE = "EXTREME_HEAD_POSE"
    VIDEO_DIMENSIONS_UNAVAILABLE = "VIDEO_DIMENSIONS_UNAVAILABLE"
    TAB_HIDDEN = "TAB_HIDDEN"
    LANDMARKER_UNAVAILABLE = "LANDMARKER_UNAVAILABLE"
    WORKER_ERROR = "WORKER_ERROR"


class EpisodeTerminationReason(StrEnum):
    RECOVERED = "RECOVERED"
    ANALYSIS_UNAVAILABLE = "ANALYSIS_UNAVAILABLE"
    CAMERA_DISABLED = "CAMERA_DISABLED"
    CONSENT_WITHDRAWN = "CONSENT_WITHDRAWN"
    SESSION_ENDED = "SESSION_ENDED"


class VisionEventEnvelope(_ContractModel):
    event_id: UUID
    version: Literal[4]
    session_id: Annotated[str, Field(min_length=1, max_length=128)]
    user_id: Annotated[str, Field(min_length=1, max_length=128)]
    client_instance_id: UUID
    seq: PositiveSeq
    session_elapsed_ms: NonNegativeFloat
    client_monotonic_ms: NonNegativeFloat
    occurred_at: datetime
    confidence: UnitScore
    measurement_confidence: UnitScore | None = None
    signal_clarity: UnitScore | None = None
    personalization_confidence: UnitScore | None = None
    evidence_strength: UnitScore | None = None
    baseline_mode: VisionBaselineMode
    coaching_eligible: StrictBool
    baseline_epoch: Annotated[int, Field(strict=True, ge=0)]
    model_version: Annotated[str, Field(min_length=1, max_length=128)]
    rule_version: Annotated[str, Field(min_length=1, max_length=128)]

    @model_validator(mode="before")
    @classmethod
    def reject_null_optional_scores(cls, data: object) -> object:
        if not isinstance(data, Mapping):
            return data
        for field_name in (
            "measurementConfidence",
            "signalClarity",
            "personalizationConfidence",
            "evidenceStrength",
            "measurement_confidence",
            "signal_clarity",
            "personalization_confidence",
            "evidence_strength",
        ):
            if field_name in data and data[field_name] is None:
                raise ValueError(f"{field_name} may be omitted but cannot be null")
        return data

    @model_validator(mode="after")
    def validate_envelope(self) -> VisionEventEnvelope:
        if self.occurred_at.tzinfo is None:
            raise ValueError("occurredAt must include a timezone offset")
        eligible_modes = {
            VisionBaselineMode.PERSONALIZED,
            VisionBaselineMode.MONOCULAR_LEFT,
            VisionBaselineMode.MONOCULAR_RIGHT,
        }
        if self.coaching_eligible and self.baseline_mode not in eligible_modes:
            raise ValueError(
                "coachingEligible requires a personalized or monocular baseline"
            )
        return self


class StartedPayload(_ContractModel):
    observed_start_elapsed_ms: NonNegativeFloat


class EndedPayload(_ContractModel):
    observed_end_elapsed_ms: NonNegativeFloat
    wall_duration_ms: NonNegativeFloat
    observed_duration_ms: NonNegativeFloat
    unobserved_duration_ms: NonNegativeFloat

    @model_validator(mode="after")
    def validate_duration_sum(self) -> EndedPayload:
        if (
            abs(
                self.observed_duration_ms
                + self.unobserved_duration_ms
                - self.wall_duration_ms
            )
            > 0.001
        ):
            raise ValueError(
                "observedDurationMs + unobservedDurationMs must equal wallDurationMs"
            )
        return self


class MultipleFacesPayload(StartedPayload):
    face_count: Annotated[int, Field(strict=True, ge=2)]


class LowLightStartedPayload(StartedPayload):
    brightness_score: UnitScore
    entry_threshold: UnitScore


class LowLightEndedPayload(EndedPayload):
    brightness_score: UnitScore


class FaceTooSmallStartedPayload(StartedPayload):
    face_area_ratio: UnitScore
    entry_threshold: UnitScore


class FaceTooSmallEndedPayload(EndedPayload):
    face_area_ratio: UnitScore


class AnalysisUnavailablePayload(StartedPayload):
    reasons: Annotated[list[FaceQualityReason], Field(min_length=1)]


class GazeAwayStartedPayload(StartedPayload):
    yaw_delta: float | None
    pitch_delta: float | None
    roll_delta: float | None
    center_delta_x: float | None
    center_delta_y: float | None
    gaze_horizontal_delta: float | None = None
    gaze_vertical_delta: float | None = None


class GazeAwayEndedPayload(EndedPayload):
    termination_reason: EpisodeTerminationReason


class ProlongedGazeAwayPayload(_ContractModel):
    active_duration_ms: NonNegativeFloat
    yaw_delta: float | None
    pitch_delta: float | None
    gaze_horizontal_delta: float | None = None
    gaze_vertical_delta: float | None = None


class SmileStartedPayload(StartedPayload):
    smile_score: UnitScore
    baseline_delta: float


class SmileEndedPayload(EndedPayload):
    peak_smile_score: UnitScore
    mean_smile_score: UnitScore
    termination_reason: EpisodeTerminationReason


class NodPayload(_ContractModel):
    amplitude_degrees: PositiveFloat
    duration_ms: PositiveFloat
    downstroke_ms: PositiveFloat
    upstroke_ms: PositiveFloat


class VisionBehaviorEventBase(VisionEventEnvelope):
    kind: Literal["behavior"]
    episode_id: UUID | None


class FaceMissingStarted(VisionBehaviorEventBase):
    event_type: Literal["FACE_MISSING_STARTED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: StartedPayload


class FaceMissingEnded(VisionBehaviorEventBase):
    event_type: Literal["FACE_MISSING_ENDED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: EndedPayload


class MultipleFacesDetected(VisionBehaviorEventBase):
    event_type: Literal["MULTIPLE_FACES_DETECTED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: MultipleFacesPayload


class LowLightStarted(VisionBehaviorEventBase):
    event_type: Literal["LOW_LIGHT_STARTED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: LowLightStartedPayload


class LowLightEnded(VisionBehaviorEventBase):
    event_type: Literal["LOW_LIGHT_ENDED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: LowLightEndedPayload


class FaceTooSmallStarted(VisionBehaviorEventBase):
    event_type: Literal["FACE_TOO_SMALL_STARTED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: FaceTooSmallStartedPayload


class FaceTooSmallEnded(VisionBehaviorEventBase):
    event_type: Literal["FACE_TOO_SMALL_ENDED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: FaceTooSmallEndedPayload


class AnalysisUnavailable(VisionBehaviorEventBase):
    event_type: Literal["ANALYSIS_UNAVAILABLE"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: AnalysisUnavailablePayload


class AnalysisRecovered(VisionBehaviorEventBase):
    event_type: Literal["ANALYSIS_RECOVERED"]
    source: Literal["FACE_QUALITY_DETECTOR"]
    payload: EndedPayload


class GazeAwayStarted(VisionBehaviorEventBase):
    event_type: Literal["GAZE_AWAY_STARTED"]
    source: Literal["SCREEN_ATTENTION_DETECTOR"]
    payload: GazeAwayStartedPayload


class GazeAwayEnded(VisionBehaviorEventBase):
    event_type: Literal["GAZE_AWAY_ENDED"]
    source: Literal["SCREEN_ATTENTION_DETECTOR"]
    payload: GazeAwayEndedPayload


class ProlongedGazeAway(VisionBehaviorEventBase):
    event_type: Literal["PROLONGED_GAZE_AWAY"]
    source: Literal["SCREEN_ATTENTION_DETECTOR"]
    payload: ProlongedGazeAwayPayload


class SmileStarted(VisionBehaviorEventBase):
    event_type: Literal["SMILE_STARTED"]
    source: Literal["SMILE_EXPRESSION_DETECTOR"]
    payload: SmileStartedPayload


class SmileEnded(VisionBehaviorEventBase):
    event_type: Literal["SMILE_ENDED"]
    source: Literal["SMILE_EXPRESSION_DETECTOR"]
    payload: SmileEndedPayload


class NodEvent(VisionBehaviorEventBase):
    event_type: Literal["NOD_EVENT"]
    source: Literal["NOD_DETECTOR"]
    payload: NodPayload


VisionBehaviorEvent: TypeAlias = Annotated[
    FaceMissingStarted
    | FaceMissingEnded
    | MultipleFacesDetected
    | LowLightStarted
    | LowLightEnded
    | FaceTooSmallStarted
    | FaceTooSmallEnded
    | AnalysisUnavailable
    | AnalysisRecovered
    | GazeAwayStarted
    | GazeAwayEnded
    | ProlongedGazeAway
    | SmileStarted
    | SmileEnded
    | NodEvent,
    Field(discriminator="event_type"),
]


class ObservationInterval(_ContractModel):
    started_at_session_elapsed_ms: NonNegativeFloat
    ended_at_session_elapsed_ms: NonNegativeFloat
    observed_duration_ms: NonNegativeFloat

    @model_validator(mode="after")
    def validate_bounds(self) -> ObservationInterval:
        interval_ms = (
            self.ended_at_session_elapsed_ms - self.started_at_session_elapsed_ms
        )
        if interval_ms < 0:
            raise ValueError("observation interval start must not exceed end")
        if self.observed_duration_ms > interval_ms:
            raise ValueError(
                "observed duration must fit inside the observation interval"
            )
        return self


class VisionCapabilities(_ContractModel):
    configured_detectors: list[DetectorName]
    active_detectors: list[DetectorName]

    @model_validator(mode="after")
    def validate_active_detectors(self) -> VisionCapabilities:
        if not set(self.active_detectors).issubset(self.configured_detectors):
            raise ValueError("active detectors must also be configured")
        return self


class FaceQualityComponents(_ContractModel):
    face_presence: UnitScore
    face_size: UnitScore
    in_frame: UnitScore
    brightness: UnitScore
    blur: UnitScore
    pose_observability: UnitScore
    tracking_stability: UnitScore


class VisionQuality(_ContractModel):
    usable: StrictBool
    state: Literal[
        "USABLE",
        "DEGRADED_CANDIDATE",
        "UNUSABLE",
        "RECOVERY_CANDIDATE",
    ]
    confidence: UnitScore
    components: FaceQualityComponents
    reasons: list[FaceQualityReason]
    pending_reasons: list[FaceQualityReason]
    face_detected: StrictBool
    face_count: Annotated[int, Field(strict=True, ge=0)]
    face_box_ratio: UnitScore | None
    brightness_score: UnitScore
    blur_score: UnitScore

    @model_validator(mode="after")
    def validate_quality(self) -> VisionQuality:
        if self.usable and self.reasons:
            raise ValueError("usable snapshots cannot contain quality failure reasons")
        if not self.face_detected and self.face_box_ratio is not None:
            raise ValueError("faceBoxRatio must be null when no face is detected")
        return self


class SmileMetric(_ContractModel):
    configuration_score: UnitScore | None
    baseline_score: UnitScore | None
    delta: float | None
    maintained: StrictBool
    prompt_suppressed_by_baseline: StrictBool
    baseline_prompt_suppression_threshold: UnitScore
    confidence: UnitScore


class HandOverMouthMetric(_ContractModel):
    active: StrictBool
    overlap_ratio: UnitScore | None
    confidence: UnitScore | None


class AttentionMetric(_ContractModel):
    score: Annotated[float, Field(ge=0, le=100)] | None
    confidence: UnitScore
    mode: Annotated[str, Field(min_length=1)]


class ActivityMetric(_ContractModel):
    upper_face_activity_score: UnitScore | None
    lower_face_activity_score: UnitScore | None
    pose_aligned_landmark_activity_score: UnitScore | None
    expression_activity_score: UnitScore | None
    confidence: UnitScore
    experimental_only: Literal[True]


class VisionMetrics(_ContractModel):
    hand_over_mouth: HandOverMouthMetric
    smile: SmileMetric
    attention: AttentionMetric
    activity: ActivityMetric
    screen_facing_score: UnitScore | None
    smile_score: UnitScore | None
    expression_activity_score: UnitScore | None
    yaw_delta: float | None
    pitch_delta: float | None
    roll_delta: float | None
    upper_face_activity_score: UnitScore | None = None
    lower_face_activity_score: UnitScore | None = None
    pose_aligned_landmark_activity_score: UnitScore | None = None
    activity_confidence: UnitScore | None = None
    eye_gaze_score: UnitScore | None = None
    gaze_horizontal_delta: float | None = None
    gaze_vertical_delta: float | None = None
    smile_configuration_score: UnitScore | None = None
    baseline_smile_score: UnitScore | None = None
    smile_delta: float | None = None
    mouth_asymmetry: UnitScore | None = None
    maintained_smile_configuration: StrictBool | None = None
    head_pose_score: UnitScore | None = None
    face_center_score: UnitScore | None = None
    iris_proxy_score: UnitScore | None = None
    screen_attention_score: Annotated[float, Field(ge=0, le=100)] | None = None
    screen_attention_confidence: UnitScore | None = None
    gaze_reliability: UnitScore | None = None
    binocular_agreement: UnitScore | None = None
    gaze_mode: str | None = None
    attention_mode: str | None = None
    attention_evidence_mode: str | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_optional_boolean(cls, data: object) -> object:
        if not isinstance(data, Mapping):
            return data
        for field_name in (
            "maintainedSmileConfiguration",
            "maintained_smile_configuration",
        ):
            if field_name in data and data[field_name] is None:
                raise ValueError(f"{field_name} may be omitted but cannot be null")
        return data


class VisionPerformance(_ContractModel):
    profile: Literal["HIGH", "MEDIUM", "LOW"]
    target_fps: PositiveFloat
    actual_fps: NonNegativeFloat
    mean_processing_ms: NonNegativeFloat
    dropped_frames_since_last_snapshot: Annotated[int, Field(strict=True, ge=0)]


class VisionMetricSnapshotPayload(_ContractModel):
    observation_interval: ObservationInterval
    capabilities: VisionCapabilities
    quality: VisionQuality
    metrics: VisionMetrics
    performance: VisionPerformance


class VisionMetricSnapshot(VisionEventEnvelope):
    event_type: Literal["VISION_METRIC_SNAPSHOT"]
    kind: Literal["metric"]
    source: Literal["VISION_PIPELINE"]
    payload: VisionMetricSnapshotPayload


VisionEvent: TypeAlias = Annotated[
    VisionBehaviorEvent | VisionMetricSnapshot,
    Field(discriminator="kind"),
]
VISION_EVENT_ADAPTER: TypeAdapter[VisionEvent] = TypeAdapter(VisionEvent)


class VisionEventBatch(_ContractModel):
    behavior_events: list[VisionBehaviorEvent] = Field(default_factory=list)
    metric_snapshots: list[VisionMetricSnapshot] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_single_publisher(self) -> VisionEventBatch:
        events = [*self.behavior_events, *self.metric_snapshots]
        if not events:
            return self
        if len({event.session_id for event in events}) != 1:
            raise ValueError("one Vision batch must contain exactly one sessionId")
        if len({event.user_id for event in events}) != 1:
            raise ValueError("one Vision batch must contain exactly one userId")
        if len({event.client_instance_id for event in events}) != 1:
            raise ValueError(
                "one Vision batch must contain exactly one clientInstanceId"
            )
        return self

    def ordered_events(self) -> list[VisionEvent]:
        """Restore the global order lost when TS splits behavior and metrics."""
        return sorted(
            [*self.behavior_events, *self.metric_snapshots],
            key=lambda event: event.seq,
        )
