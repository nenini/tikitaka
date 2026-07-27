import type {
  FaceQualityReason,
  PerformanceProfile,
} from "../core/NormalizedFaceFrame.js";

export const VISION_BEHAVIOR_EVENT_TYPES = [
  "FACE_MISSING_STARTED",
  "FACE_MISSING_ENDED",
  "MULTIPLE_FACES_DETECTED",
  "LOW_LIGHT_STARTED",
  "LOW_LIGHT_ENDED",
  "FACE_TOO_SMALL_STARTED",
  "FACE_TOO_SMALL_ENDED",
  "ANALYSIS_UNAVAILABLE",
  "ANALYSIS_RECOVERED",
  "GAZE_AWAY_STARTED",
  "GAZE_AWAY_ENDED",
  "PROLONGED_GAZE_AWAY",
  "SMILE_STARTED",
  "SMILE_ENDED",
  "NOD_EVENT",
  "LOW_EXPRESSION_ACTIVITY_STARTED",
  "LOW_EXPRESSION_ACTIVITY_ENDED",
] as const;

export type VisionBehaviorEventType =
  (typeof VISION_BEHAVIOR_EVENT_TYPES)[number];

export const VISION_EVENT_SOURCES = [
  "FACE_QUALITY_DETECTOR",
  "SCREEN_ATTENTION_DETECTOR",
  "SMILE_EXPRESSION_DETECTOR",
  "NOD_DETECTOR",
  "EXPRESSION_ACTIVITY_DETECTOR",
  "VISION_PIPELINE",
] as const;

export type VisionEventSource = (typeof VISION_EVENT_SOURCES)[number];

export const EPISODE_TERMINATION_REASONS = [
  "RECOVERED",
  "ANALYSIS_UNAVAILABLE",
  "CAMERA_DISABLED",
  "CONSENT_WITHDRAWN",
  "SESSION_ENDED",
] as const;

export type EpisodeTerminationReason =
  (typeof EPISODE_TERMINATION_REASONS)[number];

interface StartedPayload {
  readonly observedStartElapsedMs: number;
}

interface EndedPayload {
  readonly observedEndElapsedMs: number;
  readonly wallDurationMs: number;
  readonly observedDurationMs: number;
  readonly unobservedDurationMs: number;
}

export interface VisionBehaviorPayloadMap {
  readonly FACE_MISSING_STARTED: StartedPayload;
  readonly FACE_MISSING_ENDED: EndedPayload;
  readonly MULTIPLE_FACES_DETECTED: StartedPayload & {
    readonly faceCount: number;
  };
  readonly LOW_LIGHT_STARTED: StartedPayload & {
    readonly brightnessScore: number;
    readonly entryThreshold: number;
  };
  readonly LOW_LIGHT_ENDED: EndedPayload & {
    readonly brightnessScore: number;
  };
  readonly FACE_TOO_SMALL_STARTED: StartedPayload & {
    readonly faceAreaRatio: number;
    readonly entryThreshold: number;
  };
  readonly FACE_TOO_SMALL_ENDED: EndedPayload & {
    readonly faceAreaRatio: number;
  };
  readonly ANALYSIS_UNAVAILABLE: StartedPayload & {
    readonly reasons: readonly FaceQualityReason[];
  };
  readonly ANALYSIS_RECOVERED: EndedPayload;
  readonly GAZE_AWAY_STARTED: StartedPayload & {
    readonly yawDelta: number | null;
    readonly pitchDelta: number | null;
    readonly rollDelta: number | null;
    readonly centerDeltaX: number | null;
    readonly centerDeltaY: number | null;
    readonly gazeHorizontalDelta?: number | null;
    readonly gazeVerticalDelta?: number | null;
  };
  readonly GAZE_AWAY_ENDED: EndedPayload & {
    readonly terminationReason: EpisodeTerminationReason;
  };
  readonly PROLONGED_GAZE_AWAY: {
    readonly activeDurationMs: number;
    readonly yawDelta: number | null;
    readonly pitchDelta: number | null;
    readonly gazeHorizontalDelta?: number | null;
    readonly gazeVerticalDelta?: number | null;
  };
  readonly SMILE_STARTED: StartedPayload & {
    readonly smileScore: number;
    readonly baselineDelta: number;
  };
  readonly SMILE_ENDED: EndedPayload & {
    readonly peakSmileScore: number;
    readonly meanSmileScore: number;
    readonly terminationReason: EpisodeTerminationReason;
  };
  readonly NOD_EVENT: {
    readonly amplitudeDegrees: number;
    readonly durationMs: number;
    readonly downstrokeMs: number;
    readonly upstrokeMs: number;
  };
  readonly LOW_EXPRESSION_ACTIVITY_STARTED: StartedPayload & {
    readonly activityScore: number;
    readonly baselineActivityScore: number | null;
    readonly windowMs: number;
  };
  readonly LOW_EXPRESSION_ACTIVITY_ENDED: EndedPayload & {
    readonly activityScore: number;
    readonly terminationReason: EpisodeTerminationReason;
  };
}

export interface VisionEventEnvelope<TEventType extends string> {
  readonly eventId: string;
  readonly eventType: TEventType;
  readonly version: 2;
  readonly sessionId: string;
  readonly userId: string;
  readonly clientInstanceId: string;
  readonly seq: number;
  readonly sessionElapsedMs: number;
  readonly clientMonotonicMs: number;
  readonly occurredAt: string;
  readonly confidence: number;
  readonly measurementConfidence?: number;
  readonly signalClarity?: number;
  readonly personalizationConfidence?: number;
  readonly evidenceStrength?: number;
  readonly baselineMode?:
    | "PERSONALIZED"
    | "MONOCULAR_LEFT"
    | "MONOCULAR_RIGHT"
    | "COLLECTING"
    | "GLOBAL_FALLBACK"
    | "UNAVAILABLE"
    | "BASELINE_UNCERTAIN";
  readonly coachingEligible?: boolean;
  readonly baselineEpoch?: number;
  readonly source: VisionEventSource;
  readonly modelVersion: string;
  readonly ruleVersion: string;
}

export type VisionBehaviorEventFor<
  TEventType extends VisionBehaviorEventType,
> = VisionEventEnvelope<TEventType> & {
  readonly kind: "behavior";
  readonly episodeId: string | null;
  readonly payload: VisionBehaviorPayloadMap[TEventType];
};

export type VisionBehaviorEvent = {
  readonly [TEventType in VisionBehaviorEventType]: VisionBehaviorEventFor<TEventType>;
}[VisionBehaviorEventType];

export interface VisionMetricSnapshotPayload {
  readonly quality: {
    readonly usable: boolean;
    readonly state:
      | "USABLE"
      | "DEGRADED_CANDIDATE"
      | "UNUSABLE"
      | "RECOVERY_CANDIDATE";
    readonly confidence: number;
    readonly components: import("../core/NormalizedFaceFrame.js").FaceQualityComponents;
    readonly reasons: readonly FaceQualityReason[];
    readonly pendingReasons: readonly FaceQualityReason[];
    readonly faceDetected: boolean;
    readonly faceCount: number;
    readonly faceBoxRatio: number | null;
    readonly brightnessScore: number;
    readonly blurScore: number;
  };
  readonly metrics: {
    readonly smile: {
      readonly configurationScore: number | null;
      readonly delta: number | null;
      readonly maintained: boolean;
      readonly confidence: number;
    };
    readonly attention: {
      readonly score: number | null;
      readonly confidence: number;
      readonly mode: string;
    };
    readonly activity: {
      readonly upperFaceActivityScore: number | null;
      readonly lowerFaceActivityScore: number | null;
      readonly poseAlignedLandmarkActivityScore: number | null;
      readonly expressionActivityScore: number | null;
      readonly confidence: number;
      readonly experimentalOnly: true;
    };
    readonly screenFacingScore: number | null;
    readonly smileScore: number | null;
    readonly expressionActivityScore: number | null;
    readonly upperFaceActivityScore?: number | null;
    readonly lowerFaceActivityScore?: number | null;
    readonly poseAlignedLandmarkActivityScore?: number | null;
    readonly activityConfidence?: number | null;
    readonly yawDelta: number | null;
    readonly pitchDelta: number | null;
    readonly rollDelta: number | null;
    readonly eyeGazeScore?: number | null;
    readonly gazeHorizontalDelta?: number | null;
    readonly gazeVerticalDelta?: number | null;
    readonly smileConfigurationScore?: number | null;
    readonly baselineSmileScore?: number | null;
    readonly smileDelta?: number | null;
    readonly mouthAsymmetry?: number | null;
    readonly maintainedSmileConfiguration?: boolean;
    readonly headPoseScore?: number | null;
    readonly faceCenterScore?: number | null;
    readonly irisProxyScore?: number | null;
    readonly screenAttentionScore?: number | null;
    readonly screenAttentionConfidence?: number | null;
    readonly gazeReliability?: number | null;
    readonly binocularAgreement?: number | null;
    readonly gazeMode?: string | null;
    readonly attentionMode?: string | null;
    readonly attentionEvidenceMode?: string | null;
  };
  readonly performance: {
    readonly profile: PerformanceProfile;
    readonly targetFps: number;
    readonly actualFps: number;
    readonly meanProcessingMs: number;
    readonly droppedFramesSinceLastSnapshot: number;
  };
}

export type VisionMetricSnapshot = VisionEventEnvelope<"VISION_METRIC_SNAPSHOT"> & {
  readonly kind: "metric";
  readonly payload: VisionMetricSnapshotPayload;
};

export type VisionEvent = VisionBehaviorEvent | VisionMetricSnapshot;
