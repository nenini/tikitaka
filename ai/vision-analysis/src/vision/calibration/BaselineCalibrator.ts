import type { VisionConfig } from "../config/VisionConfig.js";
import type {
  FaceQualityDecision,
  NormalizedFaceFrame,
  NormalizedPrimaryFace,
} from "../core/NormalizedFaceFrame.js";
import { computeExpressionActivityScore } from "../detectors/ExpressionActivityScore.js";
import type {
  BaselineSignal,
  BaselineStatus,
  SignalBaselineMode,
  SignalBaselineState,
  VisionBaseline,
} from "./VisionBaseline.js";

const BASELINE_SIGNALS: readonly BaselineSignal[] = [
  "pose",
  "faceCenter",
  "faceGeometry",
  "smile",
  "gaze",
  "expressionActivity",
];
const MOUTH_SHAPES = ["mouthSmileLeft", "mouthSmileRight"] as const;

interface BaselineSample {
  readonly timestampMs: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly faceAreaRatio: number;
  readonly faceCenterX: number;
  readonly faceCenterY: number;
  readonly leftEyeHorizontal: number | null;
  readonly rightEyeHorizontal: number | null;
  readonly leftEyeVertical: number | null;
  readonly rightEyeVertical: number | null;
  readonly mouthSmileLeft: number | null;
  readonly mouthSmileRight: number | null;
}

export interface BaselineCalibrationState {
  readonly status: VisionBaseline["status"];
  readonly overallStatus: VisionBaseline["status"];
  readonly progress: number;
  readonly usableFrameCount: number;
  readonly excludedFrameCount: number;
  readonly setupWallTimeMs: number;
  readonly calibrationWallTimeMs: number;
  readonly calibrationUsableTimeMs: number;
  /** Compatibility alias for existing UI consumers. */
  readonly usableDurationMs: number;
  /** Compatibility alias for existing UI consumers. */
  readonly wallDurationMs: number;
  readonly baselineModeBySignal: VisionBaseline["baselineModeBySignal"];
  readonly confidenceBySignal: VisionBaseline["confidenceBySignal"];
  readonly baseline: VisionBaseline;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const atMiddle = sorted[middle] ?? 0;
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? atMiddle) + atMiddle) / 2
    : atMiddle;
}

function trimmedMean(values: readonly number[], trimRatio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const trim = Math.min(
    Math.floor(sorted.length * trimRatio),
    Math.floor((sorted.length - 1) / 2),
  );
  const retained = sorted.slice(trim, sorted.length - trim);
  return retained.reduce((sum, value) => sum + value, 0) / retained.length;
}

function available(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

function emptySignalStates(
  mode: SignalBaselineMode,
): Record<BaselineSignal, SignalBaselineState> {
  return Object.fromEntries(
    BASELINE_SIGNALS.map((signal) => [
      signal,
      { mode, confidence: 0, sampleCount: 0 },
    ]),
  ) as Record<BaselineSignal, SignalBaselineState>;
}

function emptyBaseline(status: BaselineStatus = "NOT_STARTED"): VisionBaseline {
  const terminalFallback = status === "GLOBAL_FALLBACK";
  const states = emptySignalStates(
    terminalFallback ? "GLOBAL_FALLBACK" : "COLLECTING",
  );
  return {
    status,
    baselineEpoch: 0,
    usableFrameCount: 0,
    calibratedAtSessionElapsedMs: null,
    yaw: 0,
    pitch: 0,
    roll: 0,
    faceAreaRatio: 0.15,
    faceCenterX: 0.5,
    faceCenterY: 0.5,
    eyeGazeHorizontalRatio: null,
    eyeGazeVerticalRatio: null,
    leftEyeHorizontalBaseline: null,
    rightEyeHorizontalBaseline: null,
    leftEyeVerticalBaseline: null,
    rightEyeVerticalBaseline: null,
    leftEyeBaselineConfidence: 0,
    rightEyeBaselineConfidence: 0,
    mouthSmileLeft: 0,
    mouthSmileRight: 0,
    baselineSmileScore: 0,
    blendshapeMeans: {},
    blendshapeMedianAbsoluteDeviations: {},
    expressionActivityScore: null,
    baselineModeBySignal: Object.fromEntries(
      BASELINE_SIGNALS.map((signal) => [signal, states[signal].mode]),
    ) as Record<BaselineSignal, SignalBaselineMode>,
    confidenceBySignal: Object.fromEntries(
      BASELINE_SIGNALS.map((signal) => [signal, 0]),
    ) as Record<BaselineSignal, number>,
    signalStates: states,
  };
}

/**
 * Builds session-only, signal-specific baselines. Bad-quality time pauses the
 * usable clock, and a missing eye or mouth blendshape never becomes a fake zero.
 */
export class BaselineCalibrator {
  private readonly samples: BaselineSample[] = [];
  private baseline: VisionBaseline = emptyBaseline();
  private status: BaselineStatus = "NOT_STARTED";
  private setupStartedAtMs: number | null = null;
  private collectingStartedAtMs: number | null = null;
  private stabilizationStartedAtMs: number | null = null;
  private stabilizationFrameCount = 0;
  private lastUsableAtMs: number | null = null;
  private calibrationUsableTimeMs = 0;
  private excludedFrameCount = 0;
  private readonly activityScores: number[] = [];
  private previousActivityFace: NormalizedPrimaryFace | null = null;
  private lastActivityAtMs: number | null = null;
  private activityUsableDurationMs = 0;

  constructor(
    private readonly config: VisionConfig["calibration"],
    private readonly activityConfig: VisionConfig["expressionActivity"],
    private readonly attentionConfig: VisionConfig["screenAttention"],
  ) {}

  update(
    frame: NormalizedFaceFrame,
    quality: FaceQualityDecision,
  ): BaselineCalibrationState {
    if (
      this.status === "READY" ||
      this.status === "PARTIAL" ||
      this.status === "GLOBAL_FALLBACK"
    ) {
      this.collectPostCalibrationActivity(frame, quality);
      return this.getState(frame.sessionElapsedMs);
    }

    this.setupStartedAtMs ??= frame.sessionElapsedMs;
    if (this.status === "NOT_STARTED") this.status = "PRECHECK";

    const face = frame.primaryFace;
    const commonUsable = this.isCommonUsable(frame, quality);
    if (!commonUsable || face === null) {
      this.excludedFrameCount += 1;
      this.lastUsableAtMs = null;
      this.stabilizationStartedAtMs = null;
      this.stabilizationFrameCount = 0;
      if (this.status === "COLLECTING" || this.status === "STABILIZING") {
        this.status = "PAUSED";
      }
      return this.maybeFinish(frame.sessionElapsedMs);
    }

    if (
      this.status === "PRECHECK" ||
      this.status === "PAUSED"
    ) {
      this.status = "STABILIZING";
      this.stabilizationStartedAtMs = frame.sessionElapsedMs;
      this.stabilizationFrameCount = 1;
      return this.maybeFinish(frame.sessionElapsedMs);
    }

    if (this.status === "STABILIZING") {
      this.stabilizationFrameCount += 1;
      const stableDuration =
        frame.sessionElapsedMs - (this.stabilizationStartedAtMs ?? frame.sessionElapsedMs);
      if (
        stableDuration < this.config.stabilizationDurationMs ||
        this.stabilizationFrameCount < this.config.stabilizationMinimumFrames
      ) {
        return this.maybeFinish(frame.sessionElapsedMs);
      }
      this.status = "COLLECTING";
      this.collectingStartedAtMs ??= frame.sessionElapsedMs;
      this.lastUsableAtMs = null;
    }

    this.collectSample(face, frame.sessionElapsedMs);
    return this.maybeFinish(frame.sessionElapsedMs);
  }

  getBaseline(): VisionBaseline {
    return this.baseline;
  }

  /** Explicit UI choice for skipping calibration; setup timeout alone is non-terminal. */
  useGlobalFallback(nowMs: number): BaselineCalibrationState {
    this.status = "GLOBAL_FALLBACK";
    this.baseline = {
      ...emptyBaseline("GLOBAL_FALLBACK"),
      calibratedAtSessionElapsedMs: nowMs,
    };
    return this.getState(nowMs);
  }

  getState(nowMs = this.setupStartedAtMs ?? 0): BaselineCalibrationState {
    const setupWallTimeMs =
      this.setupStartedAtMs === null ? 0 : Math.max(0, nowMs - this.setupStartedAtMs);
    const calibrationWallTimeMs =
      this.collectingStartedAtMs === null
        ? 0
        : Math.max(0, nowMs - this.collectingStartedAtMs);
    return {
      status: this.status,
      overallStatus: this.status,
      progress: Math.min(
        1,
        Math.min(
          this.calibrationUsableTimeMs / this.config.targetUsableDurationMs,
          this.samples.length / this.config.minimumUsableFrames,
        ),
      ),
      usableFrameCount: this.samples.length,
      excludedFrameCount: this.excludedFrameCount,
      setupWallTimeMs,
      calibrationWallTimeMs,
      calibrationUsableTimeMs: this.calibrationUsableTimeMs,
      usableDurationMs: this.calibrationUsableTimeMs,
      wallDurationMs: setupWallTimeMs,
      baselineModeBySignal: this.baseline.baselineModeBySignal,
      confidenceBySignal: this.baseline.confidenceBySignal,
      baseline: this.baseline,
    };
  }

  reset(): void {
    this.samples.length = 0;
    this.baseline = emptyBaseline();
    this.status = "NOT_STARTED";
    this.setupStartedAtMs = null;
    this.collectingStartedAtMs = null;
    this.stabilizationStartedAtMs = null;
    this.stabilizationFrameCount = 0;
    this.lastUsableAtMs = null;
    this.calibrationUsableTimeMs = 0;
    this.excludedFrameCount = 0;
    this.activityScores.length = 0;
    this.previousActivityFace = null;
    this.lastActivityAtMs = null;
    this.activityUsableDurationMs = 0;
  }

  private maybeFinish(nowMs: number): BaselineCalibrationState {
    const confidence = this.commonCalibrationConfidence();
    if (
      this.samples.length >= this.config.minimumUsableFrames &&
      this.calibrationUsableTimeMs >= this.config.targetUsableDurationMs &&
      confidence >= this.config.readyMinimumConfidence
    ) {
      this.status = "READY";
      this.baseline = this.computeBaseline(nowMs, "READY");
      return this.getState(nowMs);
    }

    const wallTime =
      this.collectingStartedAtMs === null
        ? 0
        : nowMs - this.collectingStartedAtMs;
    if (wallTime < this.config.maximumWallDurationMs) {
      this.baseline = {
        ...emptyBaseline(this.status),
        usableFrameCount: this.samples.length,
      };
      return this.getState(nowMs);
    }

    const partial =
      this.samples.length >= this.config.partialMinimumUsableFrames &&
      this.calibrationUsableTimeMs >= this.config.minimumUsableDurationMs &&
      confidence >= this.config.partialMinimumConfidence;
    this.status = partial ? "PARTIAL" : "GLOBAL_FALLBACK";
    this.baseline = partial
      ? this.computeBaseline(nowMs, "PARTIAL")
      : {
          ...emptyBaseline("GLOBAL_FALLBACK"),
          calibratedAtSessionElapsedMs: nowMs,
        };
    return this.getState(nowMs);
  }

  private collectSample(face: NormalizedPrimaryFace, timestampMs: number): void {
    if (this.lastUsableAtMs !== null) {
      this.calibrationUsableTimeMs += Math.min(
        500,
        Math.max(0, timestampMs - this.lastUsableAtMs),
      );
    }
    this.lastUsableAtMs = timestampMs;
    this.collectActivitySample(face, timestampMs);

    const leftBlink = face.blendshapes["eyeBlinkLeft"];
    const rightBlink = face.blendshapes["eyeBlinkRight"];
    const leftEyeUsable =
      leftBlink !== undefined &&
      leftBlink < this.attentionConfig.blinkEntryScore &&
      face.eyeGaze.left !== null;
    const rightEyeUsable =
      rightBlink !== undefined &&
      rightBlink < this.attentionConfig.blinkEntryScore &&
      face.eyeGaze.right !== null;
    this.samples.push({
      timestampMs,
      yaw: face.yaw ?? 0,
      pitch: face.pitch ?? 0,
      roll: face.roll ?? 0,
      faceAreaRatio: face.box.areaRatio,
      faceCenterX: face.box.centerX,
      faceCenterY: face.box.centerY,
      leftEyeHorizontal: leftEyeUsable
        ? (face.eyeGaze.left?.horizontalRatio ?? null)
        : null,
      rightEyeHorizontal: rightEyeUsable
        ? (face.eyeGaze.right?.horizontalRatio ?? null)
        : null,
      leftEyeVertical: leftEyeUsable
        ? (face.eyeGaze.left?.verticalRatio ?? null)
        : null,
      rightEyeVertical: rightEyeUsable
        ? (face.eyeGaze.right?.verticalRatio ?? null)
        : null,
      mouthSmileLeft: face.blendshapes["mouthSmileLeft"] ?? null,
      mouthSmileRight: face.blendshapes["mouthSmileRight"] ?? null,
    });
  }

  private computeBaseline(
    timestampMs: number,
    status: Extract<BaselineStatus, "READY" | "PARTIAL">,
  ): VisionBaseline {
    const leftH = available(this.samples.map((sample) => sample.leftEyeHorizontal));
    const rightH = available(this.samples.map((sample) => sample.rightEyeHorizontal));
    const leftV = available(this.samples.map((sample) => sample.leftEyeVertical));
    const rightV = available(this.samples.map((sample) => sample.rightEyeVertical));
    const mouthLeft = available(this.samples.map((sample) => sample.mouthSmileLeft));
    const mouthRight = available(this.samples.map((sample) => sample.mouthSmileRight));
    const leftEyeConfidence = clamp01(leftH.length / this.config.minimumUsableFrames);
    const rightEyeConfidence = clamp01(rightH.length / this.config.minimumUsableFrames);
    const mouthConfidence = clamp01(
      Math.min(mouthLeft.length, mouthRight.length) /
        this.config.minimumUsableFrames,
    );
    const commonConfidence = this.commonCalibrationConfidence();
    const gazeMode: SignalBaselineMode =
      leftEyeConfidence >= this.config.partialMinimumConfidence &&
      rightEyeConfidence >= this.config.partialMinimumConfidence
        ? "PERSONALIZED"
        : leftEyeConfidence >= this.config.partialMinimumConfidence
          ? "MONOCULAR_LEFT"
          : rightEyeConfidence >= this.config.partialMinimumConfidence
            ? "MONOCULAR_RIGHT"
            : "UNAVAILABLE";
    const smileMode: SignalBaselineMode =
      mouthConfidence >= this.config.partialMinimumConfidence
        ? "PERSONALIZED"
        : "UNAVAILABLE";
    const expressionConfidence = this.getActivityBaselineScore() === null ? 0 : 1;
    const signalStates: Record<BaselineSignal, SignalBaselineState> = {
      pose: { mode: "PERSONALIZED", confidence: commonConfidence, sampleCount: this.samples.length },
      faceCenter: { mode: "PERSONALIZED", confidence: commonConfidence, sampleCount: this.samples.length },
      faceGeometry: { mode: "PERSONALIZED", confidence: commonConfidence, sampleCount: this.samples.length },
      smile: { mode: smileMode, confidence: mouthConfidence, sampleCount: Math.min(mouthLeft.length, mouthRight.length) },
      gaze: {
        mode: gazeMode,
        confidence: Math.max(leftEyeConfidence, rightEyeConfidence),
        sampleCount: Math.max(leftH.length, rightH.length),
      },
      expressionActivity: {
        mode: expressionConfidence > 0 ? "PERSONALIZED" : "COLLECTING",
        confidence: expressionConfidence,
        sampleCount: this.activityScores.length,
      },
    };
    const mouthSmileLeft = trimmedMean(mouthLeft, this.config.trimRatio);
    const mouthSmileRight = trimmedMean(mouthRight, this.config.trimRatio);
    const means: Record<string, number> = {};
    const deviations: Record<string, number> = {};
    for (const [name, values] of [
      ["mouthSmileLeft", mouthLeft],
      ["mouthSmileRight", mouthRight],
    ] as const) {
      if (values.length === 0) continue;
      means[name] = trimmedMean(values, this.config.trimRatio);
      const center = median(values);
      const empirical = 1.4826 * median(values.map((value) => Math.abs(value - center)));
      const weight = values.length / (values.length + this.config.priorShrinkageSampleCount);
      const prior = 0.08;
      deviations[name] = Math.sqrt((1 - weight) * prior ** 2 + weight * empirical ** 2);
    }
    const leftEyeHorizontalBaseline = leftH.length === 0 ? null : median(leftH);
    const rightEyeHorizontalBaseline = rightH.length === 0 ? null : median(rightH);
    const leftEyeVerticalBaseline = leftV.length === 0 ? null : median(leftV);
    const rightEyeVerticalBaseline = rightV.length === 0 ? null : median(rightV);
    const horizontal = available([
      leftEyeHorizontalBaseline,
      rightEyeHorizontalBaseline,
    ]);
    const vertical = available([
      leftEyeVerticalBaseline,
      rightEyeVerticalBaseline,
    ]);
    return {
      status,
      baselineEpoch: 0,
      usableFrameCount: this.samples.length,
      calibratedAtSessionElapsedMs: timestampMs,
      yaw: median(this.samples.map((sample) => sample.yaw)),
      pitch: median(this.samples.map((sample) => sample.pitch)),
      roll: median(this.samples.map((sample) => sample.roll)),
      faceAreaRatio: median(this.samples.map((sample) => sample.faceAreaRatio)),
      faceCenterX: median(this.samples.map((sample) => sample.faceCenterX)),
      faceCenterY: median(this.samples.map((sample) => sample.faceCenterY)),
      eyeGazeHorizontalRatio: horizontal.length === 0 ? null : median(horizontal),
      eyeGazeVerticalRatio: vertical.length === 0 ? null : median(vertical),
      leftEyeHorizontalBaseline,
      rightEyeHorizontalBaseline,
      leftEyeVerticalBaseline,
      rightEyeVerticalBaseline,
      leftEyeBaselineConfidence: leftEyeConfidence,
      rightEyeBaselineConfidence: rightEyeConfidence,
      mouthSmileLeft,
      mouthSmileRight,
      baselineSmileScore: (mouthSmileLeft + mouthSmileRight) / 2,
      blendshapeMeans: means,
      blendshapeMedianAbsoluteDeviations: deviations,
      expressionActivityScore: this.getActivityBaselineScore(),
      baselineModeBySignal: Object.fromEntries(
        BASELINE_SIGNALS.map((signal) => [signal, signalStates[signal].mode]),
      ) as Record<BaselineSignal, SignalBaselineMode>,
      confidenceBySignal: Object.fromEntries(
        BASELINE_SIGNALS.map((signal) => [signal, signalStates[signal].confidence]),
      ) as Record<BaselineSignal, number>,
      signalStates,
    };
  }

  private commonCalibrationConfidence(): number {
    return clamp01(
      Math.min(
        this.samples.length / this.config.minimumUsableFrames,
        this.calibrationUsableTimeMs / this.config.targetUsableDurationMs,
      ),
    );
  }

  private isCommonUsable(
    frame: NormalizedFaceFrame,
    quality: FaceQualityDecision,
  ): boolean {
    const face = frame.primaryFace;
    return (
      quality.usable &&
      frame.faceCount === 1 &&
      face !== null &&
      face.yaw !== null &&
      face.pitch !== null &&
      face.roll !== null &&
      face.box.inFrameRatio >= this.config.minimumInFrameRatio &&
      Math.abs(face.yaw) <= this.config.maximumAbsoluteYawDegrees &&
      Math.abs(face.pitch) <= this.config.maximumAbsolutePitchDegrees &&
      Math.abs(face.roll) <= this.config.maximumAbsoluteRollDegrees
    );
  }

  private collectPostCalibrationActivity(
    frame: NormalizedFaceFrame,
    quality: FaceQualityDecision,
  ): void {
    if (
      this.baseline.status === "GLOBAL_FALLBACK" ||
      this.baseline.expressionActivityScore !== null ||
      !this.isCommonUsable(frame, quality) ||
      frame.primaryFace === null
    ) {
      return;
    }
    this.collectActivitySample(frame.primaryFace, frame.sessionElapsedMs);
    const score = this.getActivityBaselineScore();
    if (score !== null) {
      this.baseline = {
        ...this.baseline,
        expressionActivityScore: score,
        baselineModeBySignal: {
          ...this.baseline.baselineModeBySignal,
          expressionActivity: "PERSONALIZED",
        },
        confidenceBySignal: {
          ...this.baseline.confidenceBySignal,
          expressionActivity: 1,
        },
        signalStates: {
          ...this.baseline.signalStates,
          expressionActivity: {
            mode: "PERSONALIZED",
            confidence: 1,
            sampleCount: this.activityScores.length,
          },
        },
      };
    }
  }

  private collectActivitySample(
    face: NormalizedPrimaryFace,
    timestampMs: number,
  ): void {
    const score = computeExpressionActivityScore(
      this.previousActivityFace,
      face,
      this.activityConfig,
    );
    if (score !== null) {
      this.activityScores.push(score);
      if (this.lastActivityAtMs !== null) {
        this.activityUsableDurationMs += Math.min(
          500,
          Math.max(0, timestampMs - this.lastActivityAtMs),
        );
      }
    }
    this.previousActivityFace = face;
    this.lastActivityAtMs = timestampMs;
  }

  private getActivityBaselineScore(): number | null {
    if (
      this.activityUsableDurationMs < this.config.activityBaselineDurationMs ||
      this.activityScores.length < this.config.minimumUsableFrames
    ) {
      return null;
    }
    return trimmedMean(this.activityScores, this.config.trimRatio);
  }
}
