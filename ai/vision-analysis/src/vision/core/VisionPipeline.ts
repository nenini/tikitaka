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
  VisionBaselineMode,
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

interface MetricFrameSummary {
  readonly sessionElapsedMs: number;
  readonly faceDetected: boolean;
  readonly faceCount: number;
  readonly faceBoxRatio: number | null;
  readonly brightnessScore: number;
  readonly blurScore: number;
  readonly performance: NormalizedFaceFrame["processing"];
  readonly configuredDetectors: readonly DetectorName[];
  readonly activeDetectors: readonly DetectorName[];
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

export interface VisionSessionFinalOutput {
  /** Episodes closed for the explicit session termination reason. */
  readonly behaviorEvents: readonly VisionBehaviorEvent[];
  /** Present only for a normal end after at least one analyzed frame. */
  readonly metricSnapshot: VisionMetricSnapshot | null;
  /** Publish order: final checkpoint first, then closed behavior episodes. */
  readonly events: readonly VisionEvent[];
}

const MINIMUM_OBSERVED_FRAME_GAP_MS = 500;
const OBSERVED_FRAME_GAP_TOLERANCE = 1.5;

const FAILED_QUALITY: FaceQualityDecision = {
  usable: false,
  calibrationEligible: false,
  canStartBehavior: false,
  confidence: 0,
  components: {
    facePresence: 0,
    faceSize: 0,
    inFrame: 0,
    brightness: 0,
    blur: 0,
    poseObservability: 0,
    trackingStability: 0,
  },
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
  private metricIntervalStartedAtMs: number | null = null;
  private observedDurationSinceLastSnapshotMs = 0;
  private lastObservationAtMs: number | null = null;
  private lastObservationUsable = false;
  private latestMetricFrameSummary: MetricFrameSummary | null = null;
  private latestQuality: FaceQualityDecision | null = null;
  private latestBaseline: VisionBaseline | null = null;

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
      new ScreenAttentionDetector(
        config.screenAttention,
        eventFactory,
        config.behaviorPolicy,
      );
    this.smileExpression =
      options.detectorOverrides?.smileExpression ??
      new SmileExpressionDetector(
        config.smile,
        eventFactory,
        config.behaviorPolicy,
      );
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
  ): VisionSessionFinalOutput {
    const metricSnapshot =
      reason === "SESSION_ENDED" &&
      this.latestMetricFrameSummary !== null &&
      this.latestQuality !== null &&
      this.latestBaseline !== null
        ? this.eventFactory.withTimePoint(timePoint, () =>
            this.createMetricSnapshot(
              this.latestMetricFrameSummary as MetricFrameSummary,
              this.latestQuality as FaceQualityDecision,
              this.latestBaseline as VisionBaseline,
              true,
              timePoint.sessionElapsedMs,
            ),
          )
        : null;
    // Close active episodes before reset so downstream consumers receive an
    // explicit consent/session termination reason exactly once.
    const behaviorEvents = this.eventFactory.withTimePoint(timePoint, () =>
      this.suspendAll(reason, timePoint, []),
    );
    const events: VisionEvent[] = [
      ...(metricSnapshot === null ? [] : [metricSnapshot]),
      ...behaviorEvents,
    ];
    this.reset();
    return { behaviorEvents, metricSnapshot, events };
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
    this.metricIntervalStartedAtMs = null;
    this.observedDurationSinceLastSnapshotMs = 0;
    this.lastObservationAtMs = null;
    this.lastObservationUsable = false;
    this.latestMetricFrameSummary = null;
    this.latestQuality = null;
    this.latestBaseline = null;
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
    this.recordObservation(frame, qualityOutput.decision);
    const successfulDetectors = new Set<DetectorName>();

    if (!qualityOutput.decision.usable) {
      // Suspending clears temporal windows and closes any active behavior episode.
      const suspensionReason =
        qualityOutput.decision.reasons.includes("CAMERA_DISABLED") ||
        qualityOutput.decision.reasons.includes("TRACK_ENDED")
          ? "CAMERA_DISABLED"
          : "ANALYSIS_UNAVAILABLE";
      behaviorEvents.push(
        ...this.suspendAll(
          suspensionReason,
          frame,
          errors,
          qualityOutput.decision.unavailableSinceMs ?? undefined,
        ),
      );
    } else {
      successfulDetectors.add("FACE_QUALITY");
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
          successfulDetectors.add(entry.configName);
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
    const metricFrameSummary = this.createMetricFrameSummary(
      frame,
      successfulDetectors,
    );
    this.latestMetricFrameSummary = metricFrameSummary;
    this.latestQuality = qualityOutput.decision;
    this.latestBaseline = baseline;
    const metricSnapshot = this.createMetricSnapshot(
      metricFrameSummary,
      qualityOutput.decision,
      baseline,
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
    suspensionStartedElapsedMs?: number,
  ): VisionBehaviorEvent[] {
    const events: VisionBehaviorEvent[] = [];
    for (const entry of this.detectorEntries) {
      events.push(
        ...this.suspendDetector(
          entry,
          reason,
          timePoint,
          errors,
          suspensionStartedElapsedMs,
        ),
      );
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
    suspensionStartedElapsedMs?: number,
  ): readonly VisionBehaviorEvent[] {
    try {
      return entry.detector.suspend({
        ...timePoint,
        reason,
        ...(suspensionStartedElapsedMs === undefined
          ? {}
          : { suspensionStartedElapsedMs }),
      });
    } catch {
      errors.push({ detectorName: entry.detector.name, phase: "SUSPEND" });
      return [];
    }
  }

  private createMetricSnapshot(
    frame: MetricFrameSummary,
    quality: FaceQualityDecision,
    baseline: VisionBaseline,
    force = false,
    endedAtSessionElapsedMs = frame.sessionElapsedMs,
  ): VisionMetricSnapshot | null {
    // Rate limiting uses session time and therefore remains deterministic in tests.
    if (
      !force &&
      this.lastMetricSnapshotAtMs !== null &&
      frame.sessionElapsedMs - this.lastMetricSnapshotAtMs <
        this.config.events.metricSnapshotIntervalMs
    ) {
      return null;
    }

    const screenState = this.screenAttention.getState();
    const smileState = this.smileExpression.getState();
    const activityState = this.expressionActivity.getState();
    const intervalStartedAtMs =
      this.metricIntervalStartedAtMs ?? endedAtSessionElapsedMs;
    const payload: VisionMetricSnapshotPayload = {
      // Only scalar summaries are copied. Raw images, landmarks, and complete
      // blendshape records never enter the transport event contract.
      observationInterval: {
        startedAtSessionElapsedMs: intervalStartedAtMs,
        endedAtSessionElapsedMs,
        observedDurationMs: Math.min(
          this.observedDurationSinceLastSnapshotMs,
          Math.max(
            0,
            endedAtSessionElapsedMs - intervalStartedAtMs,
          ),
        ),
      },
      capabilities: {
        configuredDetectors: frame.configuredDetectors,
        activeDetectors: frame.activeDetectors,
      },
      quality: {
        usable: quality.usable,
        state: quality.state ?? (quality.usable ? "USABLE" : "UNUSABLE"),
        confidence: quality.confidence,
        components: quality.components ?? {
          facePresence: quality.usable ? 1 : 0,
          faceSize: quality.confidence,
          inFrame: quality.confidence,
          brightness: quality.confidence,
          blur: quality.confidence,
          poseObservability: quality.confidence,
          trackingStability: quality.confidence,
        },
        reasons: quality.reasons,
        pendingReasons: quality.pendingReasons ?? [],
        faceDetected: frame.faceDetected,
        faceCount: frame.faceCount,
        faceBoxRatio: frame.faceBoxRatio,
        brightnessScore: frame.brightnessScore,
        blurScore: frame.blurScore,
      },
      metrics: {
        smile: {
          configurationScore: this.readNullableNumber(
            smileState,
            "smileConfigurationScore",
          ),
          baselineScore: this.readNullableNumber(
            smileState,
            "baselineSmileScore",
          ),
          delta: this.readNullableNumber(smileState, "smileDelta"),
          maintained:
            this.readBoolean(
              smileState,
              "maintainedSmileConfiguration",
            ) ?? false,
          promptSuppressedByBaseline:
            this.readBoolean(
              smileState,
              "smilePromptSuppressedByBaseline",
            ) ?? false,
          baselinePromptSuppressionThreshold:
            this.readNullableNumber(
              smileState,
              "baselinePromptSuppressionScore",
            ) ?? this.config.smile.baselinePromptSuppressionScore,
          confidence:
            this.readNullableNumber(
              smileState,
              "measurementConfidence",
            ) ?? 0,
        },
        attention: {
          score: this.readNullableNumber(
            screenState,
            "screenAttentionScore",
          ),
          confidence:
            this.readNullableNumber(
              screenState,
              "screenAttentionConfidence",
            ) ?? 0,
          mode:
            this.readString(screenState, "attentionMode") ?? "UNRELIABLE",
        },
        activity: {
          upperFaceActivityScore: this.readNullableNumber(
            activityState,
            "upperFaceActivityScore",
          ),
          lowerFaceActivityScore: this.readNullableNumber(
            activityState,
            "lowerFaceActivityScore",
          ),
          poseAlignedLandmarkActivityScore: this.readNullableNumber(
            activityState,
            "poseAlignedLandmarkActivityScore",
          ),
          expressionActivityScore: this.readNullableNumber(
            activityState,
            "windowActivityScore",
          ),
          confidence:
            this.readNullableNumber(
              activityState,
              "activityConfidence",
            ) ?? 0,
          experimentalOnly: true,
        },
        screenFacingScore: this.readNullableNumber(
          screenState,
          "screenFacingScore",
        ),
        smileScore: this.readNullableNumber(smileState, "smoothedScore"),
        expressionActivityScore: this.readNullableNumber(
          activityState,
          "windowActivityScore",
        ),
        upperFaceActivityScore: this.readNullableNumber(
          activityState,
          "upperFaceActivityScore",
        ),
        lowerFaceActivityScore: this.readNullableNumber(
          activityState,
          "lowerFaceActivityScore",
        ),
        poseAlignedLandmarkActivityScore: this.readNullableNumber(
          activityState,
          "poseAlignedLandmarkActivityScore",
        ),
        activityConfidence: this.readNullableNumber(
          activityState,
          "activityConfidence",
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
        profile: frame.performance.performanceProfile,
        targetFps: frame.performance.targetFps,
        actualFps: frame.performance.actualFps,
        meanProcessingMs:
          this.processedFrameCount === 0
            ? 0
            : this.processingDurationSumMs / this.processedFrameCount,
        droppedFramesSinceLastSnapshot: this.droppedFramesSinceLastSnapshot,
      },
    };
    const snapshot = this.eventFactory.createMetricSnapshot({
      confidence: quality.confidence,
      confidenceDetails: {
        baselineMode: this.metricBaselineMode(baseline),
        coachingEligible: false,
        baselineEpoch: baseline.baselineEpoch,
      },
      payload,
    });
    this.lastMetricSnapshotAtMs = endedAtSessionElapsedMs;
    this.metricIntervalStartedAtMs = endedAtSessionElapsedMs;
    this.observedDurationSinceLastSnapshotMs = 0;
    // Performance accumulators describe only the next snapshot interval.
    this.processingDurationSumMs = 0;
    this.processedFrameCount = 0;
    this.droppedFramesSinceLastSnapshot = 0;
    return snapshot;
  }

  private recordObservation(
    frame: NormalizedFaceFrame,
    quality: FaceQualityDecision,
  ): void {
    // Both ends of a short interval must be usable. This prevents low quality
    // and missing frames from inflating the denominator used by aggregation.
    if (this.metricIntervalStartedAtMs === null) {
      // Vision can start after the call begins, so the first analyzed frame is
      // the first valid wall-clock boundary for this pipeline's metrics.
      this.metricIntervalStartedAtMs = frame.sessionElapsedMs;
    }
    if (this.lastObservationAtMs !== null) {
      const gapMs = frame.sessionElapsedMs - this.lastObservationAtMs;
      const expectedFrameIntervalMs =
        1_000 / frame.processing.targetFps;
      const maximumGapMs = Math.max(
        MINIMUM_OBSERVED_FRAME_GAP_MS,
        expectedFrameIntervalMs * OBSERVED_FRAME_GAP_TOLERANCE,
      );
      if (
        gapMs >= 0 &&
        gapMs <= maximumGapMs &&
        this.lastObservationUsable &&
        quality.usable
      ) {
        this.observedDurationSinceLastSnapshotMs += gapMs;
      }
    }
    this.lastObservationAtMs = frame.sessionElapsedMs;
    this.lastObservationUsable = quality.usable;
  }

  private createMetricFrameSummary(
    frame: NormalizedFaceFrame,
    successfulDetectors: ReadonlySet<DetectorName>,
  ): MetricFrameSummary {
    const configuredDetectors = this.configuredDetectors(frame);
    return {
      sessionElapsedMs: frame.sessionElapsedMs,
      faceDetected: frame.faceDetected,
      faceCount: frame.faceCount,
      faceBoxRatio: frame.primaryFace?.box.areaRatio ?? null,
      brightnessScore: frame.imageQuality.brightnessScore,
      blurScore: frame.imageQuality.blurScore,
      performance: { ...frame.processing },
      configuredDetectors,
      activeDetectors: configuredDetectors.filter((name) =>
        successfulDetectors.has(name),
      ),
    };
  }

  private configuredDetectors(
    frame: NormalizedFaceFrame,
  ): readonly DetectorName[] {
    // Profile and explicit feature flags define capability configuration.
    return this.config.profiles[
      frame.processing.performanceProfile
    ].enabledDetectors.filter(
      (name) =>
        name === "FACE_QUALITY" ||
        this.options.enabledDetectorOverrides?.[name] !== false,
    );
  }

  private metricBaselineMode(
    baseline: VisionBaseline,
  ): VisionBaselineMode {
    // A metric spans several signals, so the most restrictive exceptional
    // state wins before a usable personalized/monocular mode is reported.
    const modes = Object.values(baseline.baselineModeBySignal);
    if (modes.includes("BASELINE_UNCERTAIN")) {
      return "BASELINE_UNCERTAIN";
    }
    if (
      baseline.status === "NOT_STARTED" ||
      baseline.status === "PRECHECK" ||
      baseline.status === "STABILIZING" ||
      baseline.status === "COLLECTING" ||
      baseline.status === "PAUSED"
    ) {
      return "COLLECTING";
    }
    if (baseline.status === "GLOBAL_FALLBACK") {
      return "GLOBAL_FALLBACK";
    }
    if (modes.includes("MONOCULAR_LEFT")) return "MONOCULAR_LEFT";
    if (modes.includes("MONOCULAR_RIGHT")) return "MONOCULAR_RIGHT";
    if (modes.includes("PERSONALIZED")) return "PERSONALIZED";
    return "UNAVAILABLE";
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
