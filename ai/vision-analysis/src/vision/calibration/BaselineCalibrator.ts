import type { VisionConfig } from "../config/VisionConfig.js";
import type { FaceQualityDecision, NormalizedFaceFrame } from "../core/NormalizedFaceFrame.js";
import type { VisionBaseline } from "./VisionBaseline.js";

const BLENDSHAPES = [
  "mouthSmileLeft",
  "mouthSmileRight",
  "cheekSquintLeft",
  "cheekSquintRight",
] as const;

interface BaselineSample {
  readonly timestampMs: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly faceAreaRatio: number;
  readonly faceCenterX: number;
  readonly faceCenterY: number;
  readonly blendshapes: Readonly<Record<string, number>>;
}

export interface BaselineCalibrationState {
  readonly status: VisionBaseline["status"];
  readonly progress: number;
  readonly usableFrameCount: number;
  readonly excludedFrameCount: number;
  readonly usableDurationMs: number;
  readonly wallDurationMs: number;
  readonly baseline: VisionBaseline;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const atMiddle = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? atMiddle) + atMiddle) / 2 : atMiddle;
}

function trimmedMean(values: readonly number[], trimRatio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const trim = Math.min(Math.floor(sorted.length * trimRatio), Math.floor((sorted.length - 1) / 2));
  const retained = sorted.slice(trim, sorted.length - trim);
  return retained.reduce((sum, value) => sum + value, 0) / retained.length;
}

function emptyBaseline(status: VisionBaseline["status"] = "NOT_STARTED"): VisionBaseline {
  return {
    status,
    usableFrameCount: 0,
    calibratedAtSessionElapsedMs: null,
    yaw: 0,
    pitch: 0,
    roll: 0,
    faceAreaRatio: 0.15,
    faceCenterX: 0.5,
    faceCenterY: 0.5,
    mouthSmileLeft: 0,
    mouthSmileRight: 0,
    blendshapeMeans: {},
    blendshapeMedianAbsoluteDeviations: {},
    expressionActivityScore: null,
  };
}

/**
 * Builds a session-only baseline from technically usable frames.
 * No image, embedding, landmark array, or full blendshape vector is retained.
 */
export class BaselineCalibrator {
  private readonly samples: BaselineSample[] = [];
  private baseline: VisionBaseline = emptyBaseline();
  private startedAtMs: number | null = null;
  private lastUsableAtMs: number | null = null;
  private usableDurationMs = 0;
  private excludedFrameCount = 0;

  constructor(private readonly config: VisionConfig["calibration"]) {}

  update(frame: NormalizedFaceFrame, quality: FaceQualityDecision): BaselineCalibrationState {
    if (this.baseline.status === "READY" || this.baseline.status === "FALLBACK") return this.getState(frame.sessionElapsedMs);
    this.startedAtMs ??= frame.sessionElapsedMs;
    const face = frame.primaryFace;
    const valid = quality.usable && frame.faceCount === 1 && face !== null &&
      face.yaw !== null && face.pitch !== null && face.roll !== null &&
      face.box.inFrameRatio >= this.config.minimumInFrameRatio &&
      Math.abs(face.yaw) <= this.config.maximumAbsoluteYawDegrees &&
      Math.abs(face.pitch) <= this.config.maximumAbsolutePitchDegrees &&
      Math.abs(face.roll) <= this.config.maximumAbsoluteRollDegrees;

    if (valid && face !== null && face.yaw !== null && face.pitch !== null && face.roll !== null) {
      if (this.lastUsableAtMs !== null) {
        // Large gaps mean unusable periods and must not count as calibration time.
        this.usableDurationMs += Math.min(500, Math.max(0, frame.sessionElapsedMs - this.lastUsableAtMs));
      }
      this.lastUsableAtMs = frame.sessionElapsedMs;
      const selected: Record<string, number> = {};
      for (const name of BLENDSHAPES) selected[name] = face.blendshapes[name] ?? 0;
      this.samples.push({
        timestampMs: frame.sessionElapsedMs,
        yaw: face.yaw,
        pitch: face.pitch,
        roll: face.roll,
        faceAreaRatio: face.box.areaRatio,
        faceCenterX: face.box.centerX,
        faceCenterY: face.box.centerY,
        blendshapes: selected,
      });
    } else {
      this.excludedFrameCount += 1;
      this.lastUsableAtMs = null;
    }

    const wallDurationMs = frame.sessionElapsedMs - this.startedAtMs;
    if (this.samples.length >= this.config.minimumUsableFrames && this.usableDurationMs >= this.config.targetUsableDurationMs) {
      this.baseline = this.computeBaseline(frame.sessionElapsedMs);
    } else if (wallDurationMs >= this.config.maximumWallDurationMs) {
      this.baseline = { ...emptyBaseline("FALLBACK"), calibratedAtSessionElapsedMs: frame.sessionElapsedMs };
    } else {
      this.baseline = { ...emptyBaseline("COLLECTING"), usableFrameCount: this.samples.length };
    }
    return this.getState(frame.sessionElapsedMs);
  }

  getBaseline(): VisionBaseline {
    return this.baseline;
  }

  getState(nowMs = this.startedAtMs ?? 0): BaselineCalibrationState {
    return {
      status: this.baseline.status,
      progress: Math.min(1, Math.min(
        this.usableDurationMs / this.config.targetUsableDurationMs,
        this.samples.length / this.config.minimumUsableFrames,
      )),
      usableFrameCount: this.samples.length,
      excludedFrameCount: this.excludedFrameCount,
      usableDurationMs: this.usableDurationMs,
      wallDurationMs: this.startedAtMs === null ? 0 : Math.max(0, nowMs - this.startedAtMs),
      baseline: this.baseline,
    };
  }

  reset(): void {
    this.samples.length = 0;
    this.baseline = emptyBaseline();
    this.startedAtMs = null;
    this.lastUsableAtMs = null;
    this.usableDurationMs = 0;
    this.excludedFrameCount = 0;
  }

  private computeBaseline(timestampMs: number): VisionBaseline {
    const means: Record<string, number> = {};
    const deviations: Record<string, number> = {};
    for (const name of BLENDSHAPES) {
      const values = this.samples.map((sample) => sample.blendshapes[name] ?? 0);
      means[name] = trimmedMean(values, this.config.trimRatio);
      const center = median(values);
      deviations[name] = median(values.map((value) => Math.abs(value - center)));
    }
    return {
      status: "READY",
      usableFrameCount: this.samples.length,
      calibratedAtSessionElapsedMs: timestampMs,
      yaw: median(this.samples.map((sample) => sample.yaw)),
      pitch: median(this.samples.map((sample) => sample.pitch)),
      roll: median(this.samples.map((sample) => sample.roll)),
      faceAreaRatio: median(this.samples.map((sample) => sample.faceAreaRatio)),
      faceCenterX: median(this.samples.map((sample) => sample.faceCenterX)),
      faceCenterY: median(this.samples.map((sample) => sample.faceCenterY)),
      mouthSmileLeft: means["mouthSmileLeft"] ?? 0,
      mouthSmileRight: means["mouthSmileRight"] ?? 0,
      blendshapeMeans: means,
      blendshapeMedianAbsoluteDeviations: deviations,
      expressionActivityScore: null,
    };
  }
}
