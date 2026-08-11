import type { VisionBaseline } from "../calibration/VisionBaseline.js";
import type {
  FaceQualityDecision,
  NormalizedFaceFrame,
  PerformanceProfile,
} from "../core/NormalizedFaceFrame.js";
import type { VisionBehaviorEvent } from "../events/VisionEvent.js";

export const DETECTOR_SUSPENSION_REASONS = [
  "ANALYSIS_UNAVAILABLE",
  "CAMERA_DISABLED",
  "CONSENT_WITHDRAWN",
  "SESSION_ENDED",
  "PERFORMANCE_PROFILE_DISABLED",
] as const;

export type DetectorSuspensionReason =
  (typeof DETECTOR_SUSPENSION_REASONS)[number];

export interface VisionDetectorContext {
  readonly quality: FaceQualityDecision;
  readonly baseline: VisionBaseline;
  readonly performanceProfile: PerformanceProfile;
}

export interface DetectorSuspensionContext {
  readonly sessionElapsedMs: number;
  readonly clientMonotonicMs: number;
  readonly reason: DetectorSuspensionReason;
  readonly suspensionStartedElapsedMs?: number;
}

export interface VisionDetector<
  TInput = NormalizedFaceFrame,
  TState = Readonly<Record<string, string | number | boolean | null>>,
> {
  readonly name: string;

  reset(): void;

  suspend(context: DetectorSuspensionContext): readonly VisionBehaviorEvent[];

  update(
    input: TInput,
    context: VisionDetectorContext,
  ): readonly VisionBehaviorEvent[];

  getState(): Readonly<TState>;
}
