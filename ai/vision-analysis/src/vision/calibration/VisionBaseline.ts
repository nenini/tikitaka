export const BASELINE_STATUSES = [
  "NOT_STARTED",
  "COLLECTING",
  "READY",
  "FALLBACK",
] as const;

export type BaselineStatus = (typeof BASELINE_STATUSES)[number];

export interface VisionBaseline {
  readonly status: BaselineStatus;
  readonly usableFrameCount: number;
  readonly calibratedAtSessionElapsedMs: number | null;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly faceAreaRatio: number;
  readonly faceCenterX: number;
  readonly faceCenterY: number;
  readonly mouthSmileLeft: number;
  readonly mouthSmileRight: number;
  readonly blendshapeMeans: Readonly<Record<string, number>>;
  readonly blendshapeMedianAbsoluteDeviations: Readonly<Record<string, number>>;
  readonly expressionActivityScore: number | null;
}

