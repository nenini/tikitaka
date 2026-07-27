import type { DetectorName, VisionConfig } from "../config/VisionConfig.js";
import { BaselineCalibrator } from "../calibration/BaselineCalibrator.js";
import { AdaptiveBaselineManager } from "../calibration/AdaptiveBaselineManager.js";
import type {
  BaselineCalibrationState,
} from "../calibration/BaselineCalibrator.js";
import type { VisionBaseline } from "../calibration/VisionBaseline.js";
import {
  FaceQualityDetector,
  type FaceQualityDetectorOutput,
  type FaceQualityRuntimeStatus,
} from "../detectors/FaceQualityDetector.js";
import {
  ExpressionActivityDetector,
} from "../detectors/ExpressionActivityDetector.js";
import { NodDetector } from "../detectors/NodDetector.js";
import { ScreenAttentionDetector } from "../detectors/ScreenAttentionDetector.js";
import { SmileExpressionDetector } from "../detectors/SmileExpressionDetector.js";
import type {
  DetectorSuspensionReason,
  VisionDetector,
  VisionDetectorContext,
} from "../detectors/VisionDetector.js";
import type {
  VisionBehaviorEvent,
  VisionEvent,
  VisionMetricSnapshot,
  VisionMetricSnapshotPayload,
} from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import type {
  FaceQualityDecision,
  NormalizedFaceFrame,
} from "./NormalizedFaceFrame.js";

type BehaviorDetector = VisionDetector<NormalizedFaceFrame, object>;

interface DetectorEntry {
  readonly configName: Exclude<DetectorName, "FACE_QUALITY">;
  readonly detector: BehaviorDetector;
}

export interface VisionPipelineDetectorOverrides {
  /** Test or product-specific detector replacements; quality remains mandatory. */
  readonly screenAttention?: BehaviorDetector;
  readonly smileExpression?: BehaviorDetector;
  readonly expressionActivity?: BehaviorDetector;
  readonly nod?: BehaviorDetector;
}

export interface VisionPipelineOptions {
  /** Replacements keep browser orchestration separate from detector rules. */
  readonly detectorOverrides?: VisionPipelineDetectorOverrides;
  /** Explicit feature flags take precedence over defaults but not profile limits. */
  readonly enabledDetectorOverrides?: Partial<Readonly<Record<DetectorName, boolean>>>;
}

export interface VisionPipelineError {
  /** Detector names and phases are safe diagnostics; frame data is never logged. */
  readonly detectorName: string;
  readonly phase: "UPDATE" | "SUSPEND" | "RESET";
}

export interface VisionPipelineOutput {
  /** Ordered union consumed by a publisher; behavior-only access is also provided. */
  readonly events: readonly VisionEvent[];
  readonly behaviorEvents: readonly VisionBehaviorEvent[];
  readonly metricSnapshot: VisionMetricSnapshot | null;
  readonly quality: FaceQualityDecision;
  readonly calibration: BaselineCalibrationState;
  readonly baseline: VisionBaseline;
  readonly detectorErrors: readonly VisionPipelineError[];
}

const FAILED_QUALITY: FaceQualityDecision = {
  usable: false,
  confidence: 0,
  reasons: ["WORKER_ERROR"],
};

/** Coordinates local-only vision decisions; it never owns or transmits image data. */
export class VisionPipeline {
  private readonly qualityDetector: FaceQualityDetector;
  private readonly calibrator: BaselineCalibrator;
  private readonly adaptiveBaseline: AdaptiveBaselineManager;
  private readonly screenAttention: BehaviorDetector;
  private readonly smileExpression: BehaviorDetector;
  private readonly expressionActivity: BehaviorDetector;
  private readonly nod: BehaviorDetector;
  private readonly detectorEntries: readonly DetectorEntry[];
  private lastMetricSnapshotAtMs: number | null = null;
  private processingDurationSumMs = 0;
  private processedFrameCount = 0;
  private droppedFramesSinceLastSnapshot = 0;

  constructor(
    private readonly config: VisionConfig,
    private readonly eventFactory: VisionEventFactory,
    private readonly options: VisionPipelineOptions = {},
  ) {
    // Quality and calibration are owned by the pipeline because their ordering
    // is invariant; behavior detectors remain individually replaceable for tests.
    this.qualityDetector = new FaceQualityDetector(
      config.quality,
      eventFactory,
    );
    this.calibrator = new BaselineCalibrator(
      config.calibration,
      config.expressionActivity,
      config.screenAttention,
    );
    this.adaptiveBaseline = new AdaptiveBaselineManager(
      config.adaptiveBaseline,
    );
    this.screenAttention =
      options.detectorOverrides?.screenAttention ??
      new ScreenAttentionDetector(config.screenAttention, eventFactory);
    this.smileExpression =
      options.detectorOverrides?.smileExpression ??
      new SmileExpressionDetector(config.smile, eventFactory);
    this.expressionActivity =
      options.detectorOverrides?.expressionActivity ??
      new ExpressionActivityDetector(config.expressionActivity, eventFactory);
    this.nod =
      options.detectorOverrides?.nod ?? new NodDetector(config.nod, eventFactory);
    this.detectorEntries = [
      { configName: "SCREEN_ATTENTION", detector: this.screenAttention },
      { configName: "SMILE_EXPRESSION", detector: this.smileExpression },
      { configName: "EXPRESSION_ACTIVITY", detector: this.expressionActivity },
      { configName: "NOD", detector: this.nod },
    ];
  }

  process(
    frame: NormalizedFaceFrame,
    runtime?: FaceQualityRuntimeStatus,
  ): VisionPipelineOutput {
    // Scoping the factory to captured frame time guarantees identical envelope
    // timestamps even when multiple detectors emit during this synchronous call.
    return this.eventFactory.withTimePoint(
      {
        sessionElapsedMs: frame.sessionElapsedMs,
        clientMonotonicMs: frame.clientMonotonicMs,
      },
      () => this.processAtFrameTime(frame, runtime),
    );
  }

  recordDroppedFrame(count = 1): void {
    // Frame sampling happens outside this class, so drops are reported without
    // passing frame contents or coupling the pipeline to browser scheduling APIs.
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError("dropped frame count must be a non-negative integer");
    }
    this.droppedFramesSinceLastSnapshot += count;
  }

  endSession(
    reason: Extract<DetectorSuspensionReason, "CONSENT_WITHDRAWN" | "SESSION_ENDED">,
    timePoint: {
      readonly sessionElapsedMs: number;
      readonly clientMonotonicMs: number;
    },
  ): readonly VisionBehaviorEvent[] {
    // Close active episodes before reset so downstream consumers receive an
    // explicit consent/session termination reason exactly once.
    const events = this.eventFactory.withTimePoint(timePoint, () =>
      this.suspendAll(reason, timePoint, []),
    );
    this.reset();
    return events;
  }

  reset(): void {
    // Sequence reset belongs to session cleanup alongside every detector and baseline.
    this.qualityDetector.reset();
    this.calibrator.reset();
    this.adaptiveBaseline.reset();
    for (const entry of this.detectorEntries) {
      try {
        entry.detector.reset();
      } catch {
        // Reset is best-effort so one faulty detector cannot retain other state.
      }
    }
    this.eventFactory.resetSequence();
    this.lastMetricSnapshotAtMs = null;
    this.processingDurationSumMs = 0;
    this.processedFrameCount = 0;
    this.droppedFramesSinceLastSnapshot = 0;
  }

  private processAtFrameTime(
    frame: NormalizedFaceFrame,
    runtime?: FaceQualityRuntimeStatus,
  ): VisionPipelineOutput {
    const errors: VisionPipelineError[] = [];
    // Quality always executes first; no behavior detector can bypass this gate.
    const qualityOutput = this.updateQuality(frame, runtime, errors);
    const behaviorEvents: VisionBehaviorEvent[] = [...qualityOutput.events];

    // The calibrator sees unusable frames only to break timing continuity; it
    // never records their pose or expression values as baseline samples.
    const calibrationState = this.calibrator.update(
      frame,
      qualityOutput.decision,
    );
    const baseline = this.adaptiveBaseline.update(
      calibrationState.baseline,
      frame,
      qualityOutput.decision,
      {
        gaze: this.isDetectorBusy(this.screenAttention.getState()),
        nod: this.isDetectorBusy(this.nod.getState()),
        smile: this.isDetectorBusy(this.smileExpression.getState()),
      },
    );
    const calibration: BaselineCalibrationState = {
      ...calibrationState,
      baseline,
      baselineModeBySignal: baseline.baselineModeBySignal,
      confidenceBySignal: baseline.confidenceBySignal,
    };

    if (!qualityOutput.decision.usable) {
      // Suspending clears temporal windows and closes any active behavior episode.
      behaviorEvents.push(
        ...this.suspendAll(
          "ANALYSIS_UNAVAILABLE",
          frame,
          errors,
        ),
      );
    } else {
      const context: VisionDetectorContext = {
        quality: qualityOutput.decision,
        baseline,
        performanceProfile: frame.processing.performanceProfile,
      };
      for (const entry of this.detectorEntries) {
        if (!this.isDetectorEnabled(entry.configName, frame)) {
          // Profile changes also suspend state so disabled time cannot later
          // satisfy a detector's minimum-duration requirement.
          behaviorEvents.push(
            ...this.suspendDetector(
              entry,
              "PERFORMANCE_PROFILE_DISABLED",
              frame,
              errors,
            ),
          );
          continue;
        }
        try {
          behaviorEvents.push(...entry.detector.update(frame, context));
        } catch {
          // One detector failure is converted into local diagnostic metadata;
          // remaining detectors and the WebRTC call continue normally.
          errors.push({
            detectorName: entry.detector.name,
            phase: "UPDATE",
          });
          behaviorEvents.push(
            ...this.suspendDetector(
              entry,
              "ANALYSIS_UNAVAILABLE",
              frame,
              errors,
            ),
          );
          try {
            entry.detector.reset();
          } catch {
            errors.push({
              detectorName: entry.detector.name,
              phase: "RESET",
            });
          }
        }
      }
    }

    this.processingDurationSumMs += frame.processing.totalDurationMs;
    this.processedFrameCount += 1;
    const metricSnapshot = this.createMetricSnapshot(
      frame,
      qualityOutput.decision,
    );
    const events: VisionEvent[] = [...behaviorEvents];
    if (metricSnapshot !== null) events.push(metricSnapshot);

    return {
      events,
      behaviorEvents,
      metricSnapshot,
      quality: qualityOutput.decision,
      calibration,
      baseline,
      detectorErrors: errors,
    };
  }

  private updateQuality(
    frame: NormalizedFaceFrame,
    runtime: FaceQualityRuntimeStatus | undefined,
    errors: VisionPipelineError[],
  ): FaceQualityDetectorOutput {
    try {
      return runtime === undefined
        ? this.qualityDetector.update(frame)
        : this.qualityDetector.update(frame, runtime);
    } catch {
      // A quality-detector failure fails closed: behavior analysis is blocked
      // for this frame instead of guessing that the observation is usable.
      errors.push({
        detectorName: this.qualityDetector.name,
        phase: "UPDATE",
      });
      return {
        decision: FAILED_QUALITY,
        events: [],
        state: this.qualityDetector.getState(),
      };
    }
  }

  private isDetectorEnabled(
    name: Exclude<DetectorName, "FACE_QUALITY">,
    frame: NormalizedFaceFrame,
  ): boolean {
    const override = this.options.enabledDetectorOverrides?.[name];
    if (override === false) return false;
    const profile = this.config.profiles[frame.processing.performanceProfile];
    if (!profile.enabledDetectors.includes(name)) return false;
    if (name === "NOD") {
      // Nods need dense temporal samples, so both feature enablement and actual
      // measured FPS must pass before the state machine is allowed to run.
      const explicitlyEnabled = override ?? this.config.nod.enabledByDefault;
      return (
        explicitlyEnabled &&
        frame.processing.actualFps >=
          this.config.performanceGovernor.nodMinimumActualFps
      );
    }
    return override ?? true;
  }

  private suspendAll(
    reason: DetectorSuspensionReason,
    timePoint: {
      readonly sessionElapsedMs: number;
      readonly clientMonotonicMs: number;
    },
    errors: VisionPipelineError[],
  ): VisionBehaviorEvent[] {
    const events: VisionBehaviorEvent[] = [];
    for (const entry of this.detectorEntries) {
      events.push(...this.suspendDetector(entry, reason, timePoint, errors));
    }
    return events;
  }

  private suspendDetector(
    entry: DetectorEntry,
    reason: DetectorSuspensionReason,
    timePoint: {
      readonly sessionElapsedMs: number;
      readonly clientMonotonicMs: number;
    },
    errors: VisionPipelineError[],
  ): readonly VisionBehaviorEvent[] {
    try {
      return entry.detector.suspend({ ...timePoint, reason });
    } catch {
      errors.push({ detectorName: entry.detector.name, phase: "SUSPEND" });
      return [];
    }
  }

  private createMetricSnapshot(
    frame: NormalizedFaceFrame,
    quality: FaceQualityDecision,
  ): VisionMetricSnapshot | null {
    // Rate limiting uses session time and therefore remains deterministic in tests.
    if (
      this.lastMetricSnapshotAtMs !== null &&
      frame.sessionElapsedMs - this.lastMetricSnapshotAtMs <
        this.config.events.metricSnapshotIntervalMs
    ) {
      return null;
    }

    const screenState = this.screenAttention.getState();
    const smileState = this.smileExpression.getState();
    const activityState = this.expressionActivity.getState();
    const payload: VisionMetricSnapshotPayload = {
      // Only scalar summaries are copied. Raw images, landmarks, and complete
      // blendshape records never enter the transport event contract.
      quality: {
        usable: quality.usable,
        reasons: quality.reasons,
        faceDetected: frame.faceDetected,
        faceCount: frame.faceCount,
        faceBoxRatio: frame.primaryFace?.box.areaRatio ?? null,
        brightnessScore: frame.imageQuality.brightnessScore,
        blurScore: frame.imageQuality.blurScore,
      },
      metrics: {
        screenFacingScore: this.readNullableNumber(
          screenState,
          "screenFacingScore",
        ),
        smileScore: this.readNullableNumber(smileState, "smoothedScore"),
        expressionActivityScore: this.readNullableNumber(
          activityState,
          "windowActivityScore",
        ),
        yawDelta: this.readNullableNumber(screenState, "smoothedYawDelta"),
        pitchDelta: this.readNullableNumber(
          screenState,
          "smoothedPitchDelta",
        ),
        rollDelta: this.readNullableNumber(screenState, "rollDelta"),
        eyeGazeScore: this.readNullableNumber(screenState, "eyeGazeScore"),
        gazeHorizontalDelta: this.readNullableNumber(
          screenState,
          "smoothedGazeHorizontalDelta",
        ),
        gazeVerticalDelta: this.readNullableNumber(
          screenState,
          "smoothedGazeVerticalDelta",
        ),
        stiffExpressionActive: ["ACTIVE", "RECOVERING"].includes(
          this.readString(activityState, "state") ?? "",
        ),
        smileConfigurationScore: this.readNullableNumber(
          smileState,
          "smileConfigurationScore",
        ),
        baselineSmileScore: this.readNullableNumber(
          smileState,
          "baselineSmileScore",
        ),
        smileDelta: this.readNullableNumber(smileState, "smileDelta"),
        mouthAsymmetry: this.readNullableNumber(
          smileState,
          "mouthAsymmetry",
        ),
        maintainedSmileConfiguration:
          this.readBoolean(
            smileState,
            "maintainedSmileConfiguration",
          ) ?? false,
        headPoseScore: this.readNullableNumber(
          screenState,
          "headPoseScore",
        ),
        faceCenterScore: this.readNullableNumber(
          screenState,
          "faceCenterScore",
        ),
        irisProxyScore: this.readNullableNumber(
          screenState,
          "irisProxyScore",
        ),
        screenAttentionScore: this.readNullableNumber(
          screenState,
          "screenAttentionScore",
        ),
        screenAttentionConfidence: this.readNullableNumber(
          screenState,
          "screenAttentionConfidence",
        ),
        gazeReliability: this.readNullableNumber(
          screenState,
          "gazeReliability",
        ),
        binocularAgreement: this.readNullableNumber(
          screenState,
          "binocularAgreement",
        ),
        gazeMode: this.readString(screenState, "gazeMode"),
        attentionMode: this.readString(screenState, "attentionMode"),
        attentionEvidenceMode: this.readString(
          screenState,
          "attentionEvidenceMode",
        ),
      },
      performance: {
        profile: frame.processing.performanceProfile,
        targetFps: frame.processing.targetFps,
        actualFps: frame.processing.actualFps,
        meanProcessingMs:
          this.processedFrameCount === 0
            ? 0
            : this.processingDurationSumMs / this.processedFrameCount,
        droppedFramesSinceLastSnapshot: this.droppedFramesSinceLastSnapshot,
      },
    };
    const snapshot = this.eventFactory.createMetricSnapshot({
      confidence: quality.confidence,
      payload,
    });
    this.lastMetricSnapshotAtMs = frame.sessionElapsedMs;
    // Performance accumulators describe only the next snapshot interval.
    this.processingDurationSumMs = 0;
    this.processedFrameCount = 0;
    this.droppedFramesSinceLastSnapshot = 0;
    return snapshot;
  }

  private readNullableNumber(state: object, key: string): number | null {
    // Detector overrides may expose different state shapes; unknown metrics
    // degrade to null instead of breaking the entire snapshot.
    const value = Reflect.get(state, key);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readString(state: object, key: string): string | null {
    const value = Reflect.get(state, key);
    return typeof value === "string" ? value : null;
  }

  private readBoolean(state: object, key: string): boolean | null {
    const value = Reflect.get(state, key);
    return typeof value === "boolean" ? value : null;
  }

  private isDetectorBusy(state: object): boolean {
    const value = this.readString(state, "state");
    return (
      value !== null &&
      (value.includes("CANDIDATE") ||
        value.includes("ACTIVE") ||
        value.includes("RECOVERING"))
    );
  }
}
