export const BASELINE_STATUSES = [
  "NOT_STARTED",
  "PRECHECK",
  "STABILIZING",
  "COLLECTING",
  "PAUSED",
  "READY",
  "PARTIAL",
  "GLOBAL_FALLBACK",
] as const;

export type BaselineStatus = (typeof BASELINE_STATUSES)[number];
export type OverallCalibrationStatus = BaselineStatus;

export const SIGNAL_BASELINE_MODES = [
  "PERSONALIZED",
  "MONOCULAR_LEFT",
  "MONOCULAR_RIGHT",
  "COLLECTING",
  "GLOBAL_FALLBACK",
  "UNAVAILABLE",
  "BASELINE_UNCERTAIN",
] as const;

export type SignalBaselineMode = (typeof SIGNAL_BASELINE_MODES)[number];
export type BaselineSignal =
  | "pose"
  | "faceCenter"
  | "faceGeometry"
  | "smile"
  | "gaze"
  | "expressionActivity";

export interface SignalBaselineState {
  readonly mode: SignalBaselineMode;
  readonly confidence: number;
  readonly sampleCount: number;
}

export interface VisionBaseline {
  readonly schemaVersion: 2;
  readonly status: BaselineStatus;
  readonly baselineEpoch: number;
  readonly usableFrameCount: number;
  readonly calibratedAtSessionElapsedMs: number | null;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly faceAreaRatio: number;
  readonly faceCenterX: number;
  readonly faceCenterY: number;
  /** Legacy binocular averages retained for consumers while per-eye fields are adopted. */
  readonly eyeGazeHorizontalRatio: number | null;
  readonly eyeGazeVerticalRatio: number | null;
  readonly leftEyeHorizontalBaseline: number | null;
  readonly rightEyeHorizontalBaseline: number | null;
  readonly leftEyeVerticalBaseline: number | null;
  readonly rightEyeVerticalBaseline: number | null;
  readonly leftEyeBaselineConfidence: number;
  readonly rightEyeBaselineConfidence: number;
  readonly mouthSmileLeft: number;
  readonly mouthSmileRight: number;
  readonly baselineSmileScore: number;
  readonly blendshapeMeans: Readonly<Record<string, number>>;
  readonly blendshapeMedianAbsoluteDeviations: Readonly<Record<string, number>>;
  readonly expressionActivityScore: number | null;
  readonly baselineModeBySignal: Readonly<Record<BaselineSignal, SignalBaselineMode>>;
  readonly confidenceBySignal: Readonly<Record<BaselineSignal, number>>;
  readonly signalStates: Readonly<Record<BaselineSignal, SignalBaselineState>>;
}
