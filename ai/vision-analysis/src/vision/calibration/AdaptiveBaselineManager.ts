import type { VisionConfig } from "../config/VisionConfig.js";
import type {
  FaceQualityDecision,
  NormalizedFaceFrame,
} from "../core/NormalizedFaceFrame.js";
import type { VisionBaseline } from "./VisionBaseline.js";

export interface AdaptiveBaselineFreezeState {
  readonly gaze: boolean;
  readonly nod: boolean;
  readonly smile: boolean;
}

interface EligibilitySegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly eligible: boolean;
}

interface ShadowSample {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly area: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const center = sorted[middle] ?? 0;
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? center) + center) / 2
    : center;
}

function timeAlpha(deltaMs: number, halfLifeMs: number): number {
  return 1 - 2 ** (-Math.max(0, deltaMs) / halfLifeMs);
}

/**
 * Maintains a bounded adaptive baseline while preserving the immutable session
 * anchor. It consumes only scalar observations and never stores landmarks.
 */
export class AdaptiveBaselineManager {
  private initialBaseline: VisionBaseline | null = null;
  private adaptiveBaseline: VisionBaseline | null = null;
  private previousEpochBaseline: VisionBaseline | null = null;
  private lastTimestampMs: number | null = null;
  private recoveryWarmupUntilMs = 0;
  private adapting = false;
  private readonly eligibilitySegments: EligibilitySegment[] = [];
  private readonly shadowSamples: ShadowSample[] = [];
  private shadowStartedAtMs: number | null = null;

  constructor(private readonly config: VisionConfig["adaptiveBaseline"]) {}

  update(
    sourceBaseline: VisionBaseline,
    frame: NormalizedFaceFrame,
    quality: FaceQualityDecision,
    freeze: AdaptiveBaselineFreezeState,
  ): VisionBaseline {
    if (!["READY", "PARTIAL"].includes(sourceBaseline.status)) {
      this.resetRuntime();
      return sourceBaseline;
    }
    if (
      this.initialBaseline === null ||
      this.initialBaseline.calibratedAtSessionElapsedMs !==
        sourceBaseline.calibratedAtSessionElapsedMs
    ) {
      this.initialBaseline = sourceBaseline;
      this.adaptiveBaseline = sourceBaseline;
      this.previousEpochBaseline = null;
      this.resetRuntime();
    }
    const current = this.adaptiveBaseline ?? sourceBaseline;
    const face = frame.primaryFace;
    const now = frame.sessionElapsedMs;
    const gap =
      this.lastTimestampMs === null ? 0 : now - this.lastTimestampMs;
    if (gap > this.config.longGapMs) {
      this.recoveryWarmupUntilMs = now + this.config.recoveryWarmupMs;
      this.adapting = false;
      this.shadowSamples.length = 0;
      this.shadowStartedAtMs = null;
    }

    const baseEligible =
      quality.usable &&
      face !== null &&
      face.yaw !== null &&
      face.pitch !== null &&
      face.roll !== null &&
      now >= this.recoveryWarmupUntilMs;
    if (this.lastTimestampMs !== null && gap > 0) {
      this.eligibilitySegments.push({
        startMs: this.lastTimestampMs,
        endMs: now,
        eligible: baseEligible,
      });
    }
    this.lastTimestampMs = now;
    this.trimEligibility(now);
    const { ratio, observableMs } = this.eligibility();
    if (
      observableMs >= this.config.minimumObservableMs &&
      ratio >=
        (this.adapting
          ? this.config.maintainEligibleRatio
          : this.config.startEligibleRatio)
    ) {
      this.adapting = true;
    } else if (ratio < this.config.maintainEligibleRatio) {
      this.adapting = false;
    }

    if (!baseEligible || face === null || !this.adapting) {
      return current;
    }
    const initial = this.initialBaseline ?? sourceBaseline;
    const deltaMs = Math.max(1, gap);
    const poseAlpha = timeAlpha(deltaMs, this.config.poseHalfLifeMs);
    const geometryAlpha = timeAlpha(
      deltaMs,
      this.config.geometryHalfLifeMs,
    );
    const gazeAlpha = timeAlpha(deltaMs, this.config.gazeHalfLifeMs);
    const next: VisionBaseline = {
      ...current,
      yaw: freeze.gaze
        ? current.yaw
        : this.adaptBounded(
            current.yaw,
            face.yaw ?? current.yaw,
            initial.yaw,
            this.config.maximumPoseDriftDegrees,
            poseAlpha,
          ),
      pitch: freeze.gaze || freeze.nod
        ? current.pitch
        : this.adaptBounded(
            current.pitch,
            face.pitch ?? current.pitch,
            initial.pitch,
            this.config.maximumPoseDriftDegrees,
            poseAlpha,
          ),
      roll: freeze.gaze
        ? current.roll
        : this.adaptBounded(
            current.roll,
            face.roll ?? current.roll,
            initial.roll,
            this.config.maximumPoseDriftDegrees,
            geometryAlpha,
          ),
      faceCenterX: freeze.gaze
        ? current.faceCenterX
        : this.adaptBounded(
            current.faceCenterX,
            face.box.centerX,
            initial.faceCenterX,
            this.config.maximumCenterDrift,
            poseAlpha,
          ),
      faceCenterY: freeze.gaze
        ? current.faceCenterY
        : this.adaptBounded(
            current.faceCenterY,
            face.box.centerY,
            initial.faceCenterY,
            this.config.maximumCenterDrift,
            poseAlpha,
          ),
      faceAreaRatio: this.adaptBounded(
        current.faceAreaRatio,
        face.box.areaRatio,
        initial.faceAreaRatio,
        this.config.maximumAreaDrift,
        geometryAlpha,
      ),
      leftEyeHorizontalBaseline:
        freeze.gaze ||
        face.eyeGaze.left === null ||
        current.leftEyeHorizontalBaseline === null ||
        initial.leftEyeHorizontalBaseline === null
          ? current.leftEyeHorizontalBaseline
          : this.adaptBounded(
              current.leftEyeHorizontalBaseline,
              face.eyeGaze.left.horizontalRatio,
              initial.leftEyeHorizontalBaseline,
              this.config.maximumGazeDrift,
              gazeAlpha,
            ),
      rightEyeHorizontalBaseline:
        freeze.gaze ||
        face.eyeGaze.right === null ||
        current.rightEyeHorizontalBaseline === null ||
        initial.rightEyeHorizontalBaseline === null
          ? current.rightEyeHorizontalBaseline
          : this.adaptBounded(
              current.rightEyeHorizontalBaseline,
              face.eyeGaze.right.horizontalRatio,
              initial.rightEyeHorizontalBaseline,
              this.config.maximumGazeDrift,
              gazeAlpha,
            ),
      leftEyeVerticalBaseline:
        freeze.gaze ||
        face.eyeGaze.left === null ||
        current.leftEyeVerticalBaseline === null ||
        initial.leftEyeVerticalBaseline === null
          ? current.leftEyeVerticalBaseline
          : this.adaptBounded(
              current.leftEyeVerticalBaseline,
              face.eyeGaze.left.verticalRatio,
              initial.leftEyeVerticalBaseline,
              this.config.maximumGazeDrift,
              gazeAlpha,
            ),
      rightEyeVerticalBaseline:
        freeze.gaze ||
        face.eyeGaze.right === null ||
        current.rightEyeVerticalBaseline === null ||
        initial.rightEyeVerticalBaseline === null
          ? current.rightEyeVerticalBaseline
          : this.adaptBounded(
              current.rightEyeVerticalBaseline,
              face.eyeGaze.right.verticalRatio,
              initial.rightEyeVerticalBaseline,
              this.config.maximumGazeDrift,
              gazeAlpha,
            ),
      // Smile and expression activity remain fixed by policy.
      baselineSmileScore: initial.baselineSmileScore,
      mouthSmileLeft: initial.mouthSmileLeft,
      mouthSmileRight: initial.mouthSmileRight,
      expressionActivityScore: initial.expressionActivityScore,
    };
    this.adaptiveBaseline = next;
    this.collectShadowCandidate(next, frame, freeze);
    return this.adaptiveBaseline;
  }

  /** Rolls back the last silent re-anchor without discarding the initial anchor. */
  rollbackEpoch(): VisionBaseline | null {
    if (this.previousEpochBaseline === null) return this.adaptiveBaseline;
    this.adaptiveBaseline = this.previousEpochBaseline;
    this.previousEpochBaseline = null;
    return this.adaptiveBaseline;
  }

  reset(): void {
    this.initialBaseline = null;
    this.adaptiveBaseline = null;
    this.previousEpochBaseline = null;
    this.resetRuntime();
  }

  private adaptBounded(
    current: number,
    observation: number,
    anchor: number,
    maximumDrift: number,
    alpha: number,
  ): number {
    const updated = current + alpha * (observation - current);
    return clamp(updated, anchor - maximumDrift, anchor + maximumDrift);
  }

  private trimEligibility(now: number): void {
    const cutoff = now - this.config.windowMs;
    while (
      this.eligibilitySegments.length > 0 &&
      (this.eligibilitySegments[0]?.endMs ?? now) <= cutoff
    ) {
      this.eligibilitySegments.shift();
    }
  }

  private eligibility(): { ratio: number; observableMs: number } {
    let observableMs = 0;
    let eligibleMs = 0;
    for (const segment of this.eligibilitySegments) {
      const duration = Math.max(0, segment.endMs - segment.startMs);
      observableMs += duration;
      if (segment.eligible) eligibleMs += duration;
    }
    return {
      observableMs,
      ratio: observableMs === 0 ? 0 : eligibleMs / observableMs,
    };
  }

  private collectShadowCandidate(
    baseline: VisionBaseline,
    frame: NormalizedFaceFrame,
    freeze: AdaptiveBaselineFreezeState,
  ): void {
    const face = frame.primaryFace;
    const initial = this.initialBaseline;
    if (
      face === null ||
      face.yaw === null ||
      face.pitch === null ||
      face.roll === null ||
      freeze.gaze ||
      freeze.nod ||
      freeze.smile ||
      initial === null
    ) {
      this.shadowSamples.length = 0;
      this.shadowStartedAtMs = null;
      return;
    }
    const coherentGeometryShift =
      Math.hypot(
        face.box.centerX - initial.faceCenterX,
        face.box.centerY - initial.faceCenterY,
      ) >=
        this.config.maximumCenterDrift * 0.5 ||
      Math.abs(face.box.areaRatio - initial.faceAreaRatio) >=
        this.config.maximumAreaDrift * 0.5;
    if (!coherentGeometryShift) {
      this.shadowSamples.length = 0;
      this.shadowStartedAtMs = null;
      return;
    }
    this.shadowStartedAtMs ??= frame.sessionElapsedMs;
    this.shadowSamples.push({
      yaw: face.yaw,
      pitch: face.pitch,
      roll: face.roll,
      centerX: face.box.centerX,
      centerY: face.box.centerY,
      area: face.box.areaRatio,
    });
    if (
      frame.sessionElapsedMs - this.shadowStartedAtMs <
        this.config.reanchorMinimumStableMs ||
      this.shadowSamples.length < this.config.reanchorMinimumSamples
    ) {
      return;
    }
    this.previousEpochBaseline = baseline;
    this.adaptiveBaseline = {
      ...baseline,
      baselineEpoch: baseline.baselineEpoch + 1,
      yaw: median(this.shadowSamples.map((sample) => sample.yaw)),
      pitch: median(this.shadowSamples.map((sample) => sample.pitch)),
      roll: median(this.shadowSamples.map((sample) => sample.roll)),
      faceCenterX: median(this.shadowSamples.map((sample) => sample.centerX)),
      faceCenterY: median(this.shadowSamples.map((sample) => sample.centerY)),
      faceAreaRatio: median(this.shadowSamples.map((sample) => sample.area)),
    };
    this.shadowSamples.length = 0;
    this.shadowStartedAtMs = null;
  }

  private resetRuntime(): void {
    this.lastTimestampMs = null;
    this.recoveryWarmupUntilMs = 0;
    this.adapting = false;
    this.eligibilitySegments.length = 0;
    this.shadowSamples.length = 0;
    this.shadowStartedAtMs = null;
  }
}
