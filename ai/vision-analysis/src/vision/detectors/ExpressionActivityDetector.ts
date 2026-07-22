import type { VisionConfig } from "../config/VisionConfig.js";
import type {
  NormalizedFaceFrame,
  NormalizedPrimaryFace,
} from "../core/NormalizedFaceFrame.js";
import type {
  EpisodeTerminationReason,
  VisionBehaviorEvent,
} from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import { EmaFilter } from "../filters/EmaFilter.js";
import { RollingWindow } from "../filters/RollingWindow.js";
import { computeExpressionActivityScore } from "./ExpressionActivityScore.js";
import type {
  DetectorSuspensionContext,
  VisionDetector,
  VisionDetectorContext,
} from "./VisionDetector.js";

export const EXPRESSION_ACTIVITY_STATES = [
  "WAITING_FOR_BASELINE",
  "IDLE",
  "CANDIDATE",
  "ACTIVE",
  "RECOVERING",
] as const;

export type ExpressionActivityStateName =
  (typeof EXPRESSION_ACTIVITY_STATES)[number];

export interface ExpressionActivityDetectorState {
  readonly state: ExpressionActivityStateName;
  readonly rawActivityScore: number | null;
  readonly smoothedActivityScore: number | null;
  readonly windowActivityScore: number | null;
  readonly baselineActivityScore: number | null;
  readonly lowThreshold: number;
  readonly recoveryThreshold: number;
  readonly sampleCount: number;
  readonly stateSinceMs: number | null;
  readonly activeSinceMs: number | null;
}

function terminationReason(
  reason: DetectorSuspensionContext["reason"],
): EpisodeTerminationReason {
  if (reason === "CONSENT_WITHDRAWN") return "CONSENT_WITHDRAWN";
  if (reason === "SESSION_ENDED") return "SESSION_ENDED";
  return "ANALYSIS_UNAVAILABLE";
}

/**
 * Detects sustained low observable facial motion as a conservative
 * stiff-expression proxy; it does not infer emotion, tension, or interest.
 */
export class ExpressionActivityDetector
  implements
    VisionDetector<NormalizedFaceFrame, ExpressionActivityDetectorState>
{
  readonly name = "ExpressionActivityDetector";
  // Explicit state names make candidate and recovery dwell times observable in tests.
  private state: ExpressionActivityStateName = "WAITING_FOR_BASELINE";
  private stateSinceMs: number | null = null;
  private activeSinceMs: number | null = null;
  private episodeId: string | null = null;
  private previousFace: NormalizedPrimaryFace | null = null;
  private readonly scoreFilter: EmaFilter;
  private readonly scoreWindow: RollingWindow;
  private snapshot: ExpressionActivityDetectorState;

  constructor(
    private readonly config: VisionConfig["expressionActivity"],
    private readonly eventFactory: VisionEventFactory,
  ) {
    this.scoreFilter = new EmaFilter(config.emaAlpha);
    this.scoreWindow = new RollingWindow(config.windowMs);
    this.snapshot = this.emptyState();
  }

  update(
    frame: NormalizedFaceFrame,
    context: VisionDetectorContext,
  ): readonly VisionBehaviorEvent[] {
    // Quality failures terminate an active episode and clear temporal samples;
    // they must never be interpreted as a period of low facial activity.
    if (!context.quality.usable || frame.primaryFace === null) {
      return this.suspend({
        sessionElapsedMs: frame.sessionElapsedMs,
        clientMonotonicMs: frame.clientMonotonicMs,
        reason: "ANALYSIS_UNAVAILABLE",
      });
    }
    if (
      context.baseline.status !== "READY" &&
      context.baseline.status !== "FALLBACK"
    ) {
      // Pose calibration is required before behavior-relative metrics are used.
      this.clearSamples();
      this.state = "WAITING_FOR_BASELINE";
      this.stateSinceMs = null;
      this.snapshot = this.emptyState();
      return [];
    }

    const now = frame.sessionElapsedMs;
    // Activity is a frame-to-frame signal, so the first usable frame only seeds
    // the previous-face reference and cannot contribute a numeric sample.
    const rawScore = computeExpressionActivityScore(
      this.previousFace,
      frame.primaryFace,
      this.config,
    );
    this.previousFace = frame.primaryFace;
    if (this.state === "WAITING_FOR_BASELINE") {
      this.transition("IDLE", now);
    }

    if (rawScore === null) {
      this.snapshot = this.createSnapshot(null, context.baseline.expressionActivityScore);
      return [];
    }

    const smoothedScore = this.scoreFilter.update(rawScore);
    this.scoreWindow.add(now, smoothedScore);
    const samples = this.scoreWindow.snapshot();
    const windowScore = this.scoreWindow.mean();
    const baselineScore = context.baseline.expressionActivityScore;
    const [lowThreshold, recoveryThreshold] =
      baselineScore !== null && baselineScore > 0
        ? [
            baselineScore * this.config.baselineLowRatio,
            baselineScore * this.config.baselineRecoveryRatio,
          ]
        : [
            this.config.fallbackLowThreshold,
            this.config.fallbackRecoveryThreshold,
          ];
    // Require both elapsed coverage and enough samples. This prevents a sparse
    // low-FPS window from satisfying the same rule as a continuously observed one.
    const windowStartMs = samples[0]?.timestampMs ?? now;
    const warmedUp =
      samples.length >= this.config.minimumWindowSamples &&
      now - windowStartMs >= this.config.warmupMs;
    const low = warmedUp && windowScore !== null && windowScore <= lowThreshold;
    const recovered =
      windowScore !== null && windowScore >= recoveryThreshold;
    const events: VisionBehaviorEvent[] = [];

    if (this.state === "IDLE" && low) {
      // A low score starts only a candidate; no event is emitted until the
      // configured minimum duration confirms a sustained episode.
      this.transition("CANDIDATE", now);
    } else if (this.state === "CANDIDATE") {
      if (!low) {
        // Brief stillness is discarded without publishing an event.
        this.transition("IDLE", now);
      } else if (
        now - (this.stateSinceMs ?? now) >=
        this.config.lowMinimumDurationMs
      ) {
        this.activeSinceMs = this.stateSinceMs;
        this.episodeId = this.eventFactory.createEpisodeId();
        this.transition("ACTIVE", now);
        events.push(
          this.eventFactory.createBehaviorEvent(
            "STIFF_EXPRESSION_STARTED",
            {
              confidence: this.config.defaultEventConfidence,
              episodeId: this.episodeId,
              payload: {
                observedStartElapsedMs: this.activeSinceMs ?? now,
                activityScore: windowScore ?? 0,
                baselineActivityScore: baselineScore,
                windowMs: this.config.windowMs,
              },
            },
          ),
        );
      }
    } else if (this.state === "ACTIVE" && recovered) {
      // Recovery has its own higher threshold and dwell time to avoid chattering.
      this.transition("RECOVERING", now);
    } else if (this.state === "RECOVERING") {
      if (!recovered) {
        // Falling below the recovery threshold continues the same episode.
        this.transition("ACTIVE", now);
      } else if (
        now - (this.stateSinceMs ?? now) >=
        this.config.recoveryMinimumDurationMs
      ) {
        events.push(this.endEpisode(now, windowScore ?? 0, "RECOVERED"));
        this.transition("IDLE", now);
      }
    }

    this.snapshot = {
      state: this.state,
      rawActivityScore: rawScore,
      smoothedActivityScore: smoothedScore,
      windowActivityScore: windowScore,
      baselineActivityScore: baselineScore,
      lowThreshold,
      recoveryThreshold,
      sampleCount: samples.length,
      stateSinceMs: this.stateSinceMs,
      activeSinceMs: this.activeSinceMs,
    };
    return events;
  }

  suspend(
    context: DetectorSuspensionContext,
  ): readonly VisionBehaviorEvent[] {
    // An active episode is closed once with an explicit technical/session reason.
    const activityScore = this.scoreWindow.mean() ?? 0;
    const events =
      this.activeSinceMs === null
        ? []
        : [
            this.endEpisode(
              context.sessionElapsedMs,
              activityScore,
              terminationReason(context.reason),
            ),
          ];
    this.clearSamples();
    this.state = "WAITING_FOR_BASELINE";
    this.stateSinceMs = null;
    this.snapshot = this.emptyState();
    return events;
  }

  getState(): Readonly<ExpressionActivityDetectorState> {
    return this.snapshot;
  }

  reset(): void {
    // Session-scoped filters, windows, episode IDs, and previous-face data must
    // not survive consent withdrawal or a new session.
    this.clearSamples();
    this.state = "WAITING_FOR_BASELINE";
    this.stateSinceMs = null;
    this.activeSinceMs = null;
    this.episodeId = null;
    this.snapshot = this.emptyState();
  }

  private transition(state: ExpressionActivityStateName, now: number): void {
    this.state = state;
    this.stateSinceMs = now;
  }

  private endEpisode(
    now: number,
    activityScore: number,
    reason: EpisodeTerminationReason,
  ): VisionBehaviorEvent {
    // STARTED and ENDED share an episode ID so downstream aggregation does not
    // have to infer pairing from timestamps.
    const start = this.activeSinceMs ?? now;
    const event = this.eventFactory.createBehaviorEvent(
      "STIFF_EXPRESSION_ENDED",
      {
        confidence: this.config.defaultEventConfidence,
        episodeId: this.episodeId,
        payload: {
          observedEndElapsedMs: now,
          durationMs: Math.max(0, now - start),
          activityScore,
          terminationReason: reason,
        },
      },
    );
    this.activeSinceMs = null;
    this.episodeId = null;
    return event;
  }

  private clearSamples(): void {
    // Clearing the previous frame also prevents motion across an observation gap
    // from being treated as one continuous facial movement.
    this.previousFace = null;
    this.scoreFilter.reset();
    this.scoreWindow.reset();
  }

  private createSnapshot(
    rawScore: number | null,
    baselineScore: number | null,
  ): ExpressionActivityDetectorState {
    const [lowThreshold, recoveryThreshold] =
      baselineScore !== null && baselineScore > 0
        ? [
            baselineScore * this.config.baselineLowRatio,
            baselineScore * this.config.baselineRecoveryRatio,
          ]
        : [
            this.config.fallbackLowThreshold,
            this.config.fallbackRecoveryThreshold,
          ];
    return {
      state: this.state,
      rawActivityScore: rawScore,
      smoothedActivityScore: this.scoreFilter.getValue(),
      windowActivityScore: this.scoreWindow.mean(),
      baselineActivityScore: baselineScore,
      lowThreshold,
      recoveryThreshold,
      sampleCount: this.scoreWindow.snapshot().length,
      stateSinceMs: this.stateSinceMs,
      activeSinceMs: this.activeSinceMs,
    };
  }

  private emptyState(): ExpressionActivityDetectorState {
    return this.createSnapshot(null, null);
  }
}
