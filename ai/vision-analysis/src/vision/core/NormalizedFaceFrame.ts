import type { NormalizedHand } from "./NormalizedHand.js";

export const PERFORMANCE_PROFILES = ["HIGH", "MEDIUM", "LOW"] as const;
export type PerformanceProfile = (typeof PERFORMANCE_PROFILES)[number];

export interface NormalizedFaceBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly areaRatio: number;
  readonly inFrameRatio: number;
}

export interface NormalizedFaceGeometry {
  readonly mouthCornerLiftLeft: number | null;
  readonly mouthCornerLiftRight: number | null;
  readonly noseToChinVerticalRatio: number | null;
  readonly landmarkDisplacementScore: number | null;
}

export interface NormalizedEyePosition {
  /** Iris position from the image-left eye corner (0) to image-right (1). */
  readonly horizontalRatio: number;
  /** Iris position from the upper eyelid (0) to the lower eyelid (1). */
  readonly verticalRatio: number;
}

/** Privacy-safe iris summaries; no raw eye landmarks leave the normalizer. */
export interface NormalizedEyeGaze {
  readonly left: NormalizedEyePosition | null;
  readonly right: NormalizedEyePosition | null;
  readonly horizontalRatio: number | null;
  readonly verticalRatio: number | null;
  readonly binocularAgreementScore: number | null;
}

export interface NormalizedPrimaryFace {
  readonly box: NormalizedFaceBox;
  readonly yaw: number | null;
  readonly pitch: number | null;
  readonly roll: number | null;
  readonly blendshapes: Readonly<Record<string, number>>;
  /** Required keys absent from the MediaPipe result; absence is not score zero. */
  readonly missingRequiredBlendshapes: readonly string[];
  readonly geometry: NormalizedFaceGeometry;
  readonly eyeGaze: NormalizedEyeGaze;
}

export interface NormalizedFaceFrame {
  readonly schemaVersion: 1;
  readonly frameId: number;
  readonly sessionElapsedMs: number;
  readonly clientMonotonicMs: number;
  readonly capturedAt: string;
  readonly source: {
    readonly width: number;
    readonly height: number;
    readonly mirrored: false;
  };
  readonly faceDetected: boolean;
  readonly faceCount: number;
  readonly primaryFace: NormalizedPrimaryFace | null;
  /** Browser-local hand observations; public Vision events never include them. */
  readonly handDetected: boolean;
  readonly handCount: number;
  readonly hands: readonly NormalizedHand[];
  readonly imageQuality: {
    /** 0 is very dark and 1 is sufficiently bright. */
    readonly brightnessScore: number;
    /** 0 is strong face-vs-background backlight and 1 is evenly exposed. */
    readonly backlightScore?: number;
    /** 0 is severely blurred and 1 is sharp. */
    readonly blurScore: number;
    /** Unscaled Laplacian variance exposed locally for threshold tuning. */
    readonly rawLaplacianVariance: number;
  };
  readonly processing: {
    /** Combined Face + Hand Landmarker time used by the performance governor. */
    readonly landmarkerDurationMs: number;
    readonly faceLandmarkerDurationMs: number;
    readonly handLandmarkerDurationMs: number;
    readonly totalDurationMs: number;
    readonly targetFps: number;
    readonly actualFps: number;
    readonly performanceProfile: PerformanceProfile;
  };
}

export const FACE_QUALITY_REASONS = [
  "CAMERA_DISABLED",
  "TRACK_ENDED",
  "FACE_MISSING",
  "MULTIPLE_FACES",
  "FACE_TOO_SMALL",
  "FACE_TOO_LARGE",
  "FACE_OUT_OF_FRAME",
  "LOW_LIGHT",
  "BACKLIGHT",
  "SEVERE_BLUR",
  "EXTREME_HEAD_POSE",
  "VIDEO_DIMENSIONS_UNAVAILABLE",
  "TAB_HIDDEN",
  "LANDMARKER_UNAVAILABLE",
  "WORKER_ERROR",
] as const;

export type FaceQualityReason = (typeof FACE_QUALITY_REASONS)[number];

export interface FaceQualityComponents {
  readonly facePresence: number;
  readonly faceSize: number;
  readonly inFrame: number;
  readonly brightness: number;
  readonly blur: number;
  readonly poseObservability: number;
  readonly trackingStability: number;
}

export interface FaceQualityDecision {
  /** Metrics may still be produced while degraded; UNUSABLE blocks observation. */
  readonly usable: boolean;
  /** A degraded candidate cannot seed calibration or a new behavior candidate. */
  readonly calibrationEligible?: boolean;
  readonly canStartBehavior?: boolean;
  readonly confidence: number;
  readonly components?: FaceQualityComponents;
  readonly reasons: readonly FaceQualityReason[];
  readonly state?:
    | "USABLE"
    | "DEGRADED_CANDIDATE"
    | "UNUSABLE"
    | "RECOVERY_CANDIDATE";
  readonly pendingReasons?: readonly FaceQualityReason[];
  readonly unavailableSinceMs?: number | null;
}
