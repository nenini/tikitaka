import type { VisionConfig } from "../config/VisionConfig.js";
import type {
  NormalizedFaceFrame,
  NormalizedPrimaryFace,
} from "../core/NormalizedFaceFrame.js";
import type { VisionBehaviorEvent } from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import { TimeBasedEmaFilter } from "../filters/EmaFilter.js";
import { RollingWindow } from "../filters/RollingWindow.js";
import {
  computeExpressionActivityScores,
  type ExpressionActivityScores,
} from "./ExpressionActivityScore.js";
import type {
  DetectorSuspensionContext,
  VisionDetector,
  VisionDetectorContext,
} from "./VisionDetector.js";

export type ExpressionActivityStateName =
  | "WAITING_FOR_BASELINE"
  | "NORMAL"
  | "SUSPENDED";

export interface ExpressionActivityDetectorState
  extends ExpressionActivityScores {
  readonly state: ExpressionActivityStateName;
  readonly rawActivityScore: number | null;
  readonly smoothedActivityScore: number | null;
  readonly windowActivityScore: number | null;
  readonly baselineActivityScore: number | null;
  readonly sampleCount: number;
  readonly observableDurationMs: number;
}

const EMPTY_SCORES: ExpressionActivityScores = {
  upperFaceActivityScore: null,
  lowerFaceActivityScore: null,
  poseAlignedLandmarkActivityScore: null,
  expressionActivityScore: null,
  activityConfidence: 0,
};

/**
 * Experimental continuous metric only.
 *
 * Without local VAD, speech-related lower-face motion cannot be separated from
 * expressive motion. The v2 policy therefore publishes no LOW/STIFF behavior
 * events and never makes this detector a direct coaching source.
 */
export class ExpressionActivityDetector
  implements
    VisionDetector<NormalizedFaceFrame, ExpressionActivityDetectorState>
{
  readonly name = "ExpressionActivityDetector";
  private state: ExpressionActivityStateName = "WAITING_FOR_BASELINE";
  private previousFace: NormalizedPrimaryFace | null = null;
  private previousTimestampMs: number | null = null;
  private observableDurationMs = 0;
  private readonly scoreFilter: TimeBasedEmaFilter;
  private readonly scoreWindow: RollingWindow;
  private snapshot: ExpressionActivityDetectorState;

  constructor(
    private readonly config: VisionConfig["expressionActivity"],
    eventFactory: VisionEventFactory,
  ) {
    // Kept in the constructor signature for detector composition compatibility.
    void eventFactory;
    this.scoreFilter = new TimeBasedEmaFilter(
      Math.max(1, config.windowMs / 4),
    );
    this.scoreWindow = new RollingWindow(config.windowMs);
    this.snapshot = this.emptyState();
  }

  update(
    frame: NormalizedFaceFrame,
    context: VisionDetectorContext,
  ): readonly VisionBehaviorEvent[] {
    if (!context.quality.usable || frame.primaryFace === null) {
      this.suspend({
        sessionElapsedMs: frame.sessionElapsedMs,
        clientMonotonicMs: frame.clientMonotonicMs,
        reason: "ANALYSIS_UNAVAILABLE",
      });
      return [];
    }

    const now = frame.sessionElapsedMs;
    const deltaMs =
      this.previousTimestampMs === null ? 0 : now - this.previousTimestampMs;
    const scores = computeExpressionActivityScores(
      this.previousFace,
      frame.primaryFace,
      deltaMs,
      context.quality.confidence,
      this.config,
    );
    this.previousFace = frame.primaryFace;
    this.previousTimestampMs = now;
    this.state = "NORMAL";

    if (
      scores.expressionActivityScore !== null &&
      scores.activityConfidence > 0
    ) {
      this.observableDurationMs += Math.max(0, deltaMs);
      const smoothed = this.scoreFilter.update(
        scores.expressionActivityScore,
        now,
      );
      this.scoreWindow.add(now, smoothed);
    }

    this.snapshot = {
      ...scores,
      state: this.state,
      rawActivityScore: scores.expressionActivityScore,
      smoothedActivityScore: this.scoreFilter.getValue(),
      windowActivityScore: this.scoreWindow.mean(),
      baselineActivityScore: context.baseline.expressionActivityScore,
      sampleCount: this.scoreWindow.snapshot().length,
      observableDurationMs: this.observableDurationMs,
    };
    return [];
  }

  suspend(
    _context: DetectorSuspensionContext,
  ): readonly VisionBehaviorEvent[] {
    this.clearSamples();
    this.state = "SUSPENDED";
    this.snapshot = this.emptyState();
    return [];
  }

  getState(): Readonly<ExpressionActivityDetectorState> {
    return this.snapshot;
  }

  reset(): void {
    this.clearSamples();
    this.state = "WAITING_FOR_BASELINE";
    this.snapshot = this.emptyState();
  }

  private clearSamples(): void {
    this.previousFace = null;
    this.previousTimestampMs = null;
    this.observableDurationMs = 0;
    this.scoreFilter.reset();
    this.scoreWindow.reset();
  }

  private emptyState(): ExpressionActivityDetectorState {
    return {
      ...EMPTY_SCORES,
      state: this.state,
      rawActivityScore: null,
      smoothedActivityScore: null,
      windowActivityScore: null,
      baselineActivityScore: null,
      sampleCount: 0,
      observableDurationMs: this.observableDurationMs,
    };
  }
}
