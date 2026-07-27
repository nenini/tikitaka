import type { VisionConfig } from "../config/VisionConfig.js";
import type { NormalizedFaceFrame } from "../core/NormalizedFaceFrame.js";
import type {
  EpisodeTerminationReason,
  VisionBehaviorEvent,
} from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import { TimeBasedEmaFilter } from "../filters/EmaFilter.js";
import type {
  DetectorSuspensionContext,
  VisionDetector,
  VisionDetectorContext,
} from "./VisionDetector.js";

export const SMILE_STATES = [
  "WAITING_FOR_BASELINE",
  "UNAVAILABLE",
  "IDLE",
  "SMILE_CANDIDATE",
  "SMILE_ACTIVE",
  "END_CANDIDATE",
] as const;
export type SmileStateName = (typeof SMILE_STATES)[number];

export type SmileConfigurationLevel =
  | "LOW_SMILE_CONFIGURATION"
  | "SUBTLE_SMILE_CONFIGURATION"
  | "SMILE_CONFIGURATION"
  | "STRONG_SMILE_CONFIGURATION";
export type SmileChangeLevel =
  | "NO_SIGNIFICANT_INCREASE"
  | "SUBTLE_INCREASE"
  | "SMILE_INCREASE"
  | "STRONG_INCREASE";

export interface SmileExpressionDetectorState {
  readonly state: SmileStateName;
  readonly signalAvailable: boolean;
  readonly mouthSmileLeft: number | null;
  readonly mouthSmileRight: number | null;
  readonly rawScore: number | null;
  readonly smoothedScore: number | null;
  readonly smileConfigurationScore: number | null;
  readonly smileConfigurationLevel: SmileConfigurationLevel | null;
  readonly baselineScore: number | null;
  readonly baselineSmileScore: number | null;
  readonly baselineSmileConfigurationLevel: SmileConfigurationLevel | null;
  readonly baselineDelta: number | null;
  readonly smileDelta: number | null;
  readonly smileChangeLevel: SmileChangeLevel | null;
  readonly mouthAsymmetry: number | null;
  readonly measurementConfidence: number;
  readonly personalizationConfidence: number;
  readonly coachingEligible: boolean;
  readonly maintainedSmileConfiguration: boolean;
  readonly maintainedDurationMs: number;
  readonly stateSinceMs: number | null;
  readonly activeSinceMs: number | null;
  readonly peakScore: number;
  readonly peakSmileLevel: SmileConfigurationLevel | null;
}

function terminationReason(
  reason: DetectorSuspensionContext["reason"],
): EpisodeTerminationReason {
  if (reason === "CONSENT_WITHDRAWN") return "CONSENT_WITHDRAWN";
  if (reason === "SESSION_ENDED") return "SESSION_ENDED";
  return "ANALYSIS_UNAVAILABLE";
}

/** Detects mouth-corner configurations and change episodes, never emotion. */
export class SmileExpressionDetector
  implements VisionDetector<NormalizedFaceFrame, SmileExpressionDetectorState>
{
  readonly name = "SmileExpressionDetector";
  private state: SmileStateName = "WAITING_FOR_BASELINE";
  private stateSinceMs: number | null = null;
  private activeSinceMs: number | null = null;
  private episodeId: string | null = null;
  private peakScore = 0;
  private peakSmileLevel: SmileConfigurationLevel | null = null;
  private scoreSum = 0;
  private scoreCount = 0;
  private candidateObservations = 0;
  private maintainedSinceMs: number | null = null;
  private lastFrameAtMs: number | null = null;
  private readonly scoreFilter: TimeBasedEmaFilter;
  private snapshot: SmileExpressionDetectorState = this.emptyState();

  constructor(
    private readonly config: VisionConfig["smile"],
    private readonly eventFactory: VisionEventFactory,
  ) {
    this.scoreFilter = new TimeBasedEmaFilter(config.emaHalfLifeMs);
  }

  update(
    frame: NormalizedFaceFrame,
    context: VisionDetectorContext,
  ): readonly VisionBehaviorEvent[] {
    if (!context.quality.usable || frame.primaryFace === null) {
      return this.suspend({
        sessionElapsedMs: frame.sessionElapsedMs,
        clientMonotonicMs: frame.clientMonotonicMs,
        reason: "ANALYSIS_UNAVAILABLE",
      });
    }
    if (
      !["READY", "PARTIAL", "GLOBAL_FALLBACK"].includes(
        context.baseline.status,
      )
    ) {
      this.state = "WAITING_FOR_BASELINE";
      this.snapshot = this.emptyState();
      return [];
    }

    const now = frame.sessionElapsedMs;
    if (
      this.lastFrameAtMs !== null &&
      now - this.lastFrameAtMs > this.config.maximumFrameGapMs
    ) {
      // A long observation gap cannot satisfy a continuous episode duration.
      this.resetCandidate(now);
      this.scoreFilter.reset();
    }
    this.lastFrameAtMs = now;

    const shapes = frame.primaryFace.blendshapes;
    const left = shapes["mouthSmileLeft"];
    const right = shapes["mouthSmileRight"];
    if (left === undefined || right === undefined) {
      const events =
        this.activeSinceMs === null
          ? []
          : [this.endEpisode(now, "ANALYSIS_UNAVAILABLE")];
      this.state = "UNAVAILABLE";
      this.scoreFilter.reset();
      this.snapshot = this.emptyState();
      return events;
    }

    const raw = (left + right) / 2;
    const score = this.scoreFilter.update(raw, now);
    const personalized =
      context.baseline.baselineModeBySignal.smile === "PERSONALIZED";
    const base = personalized ? context.baseline.baselineSmileScore : null;
    const delta = base === null ? null : score - base;
    const asymmetry = Math.abs(left - right);
    const asymmetryFactor =
      asymmetry <= this.config.asymmetryConfidenceStart
        ? 1
        : asymmetry >= this.config.asymmetryHigh
          ? 0.75
          : 0.9;
    const measurementConfidence =
      context.quality.confidence * asymmetryFactor;
    const personalizationConfidence = personalized
      ? context.baseline.confidenceBySignal.smile
      : 0;
    const configurationLevel = this.configurationLevel(score);
    const changeLevel = delta === null ? null : this.changeLevel(delta);
    const baselineLevel =
      base === null ? null : this.configurationLevel(base);
    const configurationMaintained =
      score >= this.config.subtleAbsoluteScore &&
      measurementConfidence >= this.config.minimumMeasurementConfidence;
    if (configurationMaintained) {
      this.maintainedSinceMs ??= now;
    } else {
      this.maintainedSinceMs = null;
    }
    const maintainedDurationMs =
      this.maintainedSinceMs === null ? 0 : now - this.maintainedSinceMs;

    const fallbackEntry =
      !personalized &&
      score >= this.config.strongAbsoluteScore &&
      left >= this.config.fallbackMinimumSideScore &&
      right >= this.config.fallbackMinimumSideScore &&
      asymmetry <= this.config.fallbackMaximumAsymmetry &&
      measurementConfidence >=
        this.config.fallbackMinimumMeasurementConfidence;
    const personalizedEntry =
      personalized &&
      delta !== null &&
      score >= this.config.smileAbsoluteScore &&
      delta >= this.config.smileDelta &&
      asymmetry <= this.config.asymmetryHold &&
      measurementConfidence >= this.config.minimumMeasurementConfidence;
    const entry = personalizedEntry || fallbackEntry;
    const requiredDuration = personalized
      ? this.config.smileMinimumDurationMs
      : this.config.fallbackMinimumDurationMs;
    const requiredObservations = personalized
      ? this.config.smileMinimumObservations
      : this.config.fallbackMinimumObservations;
    const recovered =
      personalized && delta !== null
        ? score <= this.config.smileRecoveryAbsoluteScore ||
          delta <= this.config.smileRecoveryDelta
        : score <= this.config.strongRecoveryAbsoluteScore;
    const events: VisionBehaviorEvent[] = [];

    if (this.state === "WAITING_FOR_BASELINE" || this.state === "UNAVAILABLE") {
      this.transition("IDLE", now);
    }
    if (this.state === "IDLE" && entry) {
      this.candidateObservations = 1;
      this.transition("SMILE_CANDIDATE", now);
    } else if (this.state === "SMILE_CANDIDATE") {
      if (!entry) {
        this.resetCandidate(now);
      } else {
        this.candidateObservations += 1;
        if (
          now - (this.stateSinceMs ?? now) >= requiredDuration &&
          this.candidateObservations >= requiredObservations
        ) {
          this.activeSinceMs = this.stateSinceMs;
          this.episodeId = this.eventFactory.createEpisodeId();
          this.peakScore = score;
          this.peakSmileLevel = configurationLevel;
          this.scoreSum = score;
          this.scoreCount = 1;
          this.transition("SMILE_ACTIVE", now);
          events.push(
            this.eventFactory.createBehaviorEvent("SMILE_STARTED", {
              confidence: this.eventConfidence(
                measurementConfidence,
                personalizationConfidence,
                personalized,
              ),
              confidenceDetails: {
                measurementConfidence,
                signalClarity: measurementConfidence,
                personalizationConfidence,
                evidenceStrength: Math.min(
                  measurementConfidence,
                  personalized ? personalizationConfidence : 0.55,
                ),
                baselineMode: personalized
                  ? "PERSONALIZED"
                  : "GLOBAL_FALLBACK",
                coachingEligible: personalized,
                baselineEpoch: context.baseline.baselineEpoch,
              },
              episodeId: this.episodeId,
              payload: {
                observedStartElapsedMs: this.activeSinceMs ?? now,
                smileScore: score,
                baselineDelta: delta ?? 0,
              },
            }),
          );
        }
      }
    } else if (this.state === "SMILE_ACTIVE") {
      this.recordScore(score, configurationLevel);
      if (recovered) this.transition("END_CANDIDATE", now);
    } else if (this.state === "END_CANDIDATE") {
      this.recordScore(score, configurationLevel);
      if (!recovered) {
        this.transition("SMILE_ACTIVE", now);
      } else if (
        now - (this.stateSinceMs ?? now) >=
        Math.max(
          this.config.smileRecoveryDurationMs,
          this.config.smileMergeGapMs,
        )
      ) {
        events.push(this.endEpisode(now, "RECOVERED"));
        this.transition("IDLE", now);
      }
    }

    this.snapshot = {
      state: this.state,
      signalAvailable: true,
      mouthSmileLeft: left,
      mouthSmileRight: right,
      rawScore: raw,
      smoothedScore: score,
      smileConfigurationScore: score,
      smileConfigurationLevel: configurationLevel,
      baselineScore: base,
      baselineSmileScore: base,
      baselineSmileConfigurationLevel: baselineLevel,
      baselineDelta: delta,
      smileDelta: delta,
      smileChangeLevel: changeLevel,
      mouthAsymmetry: asymmetry,
      measurementConfidence,
      personalizationConfidence,
      coachingEligible: personalized,
      maintainedSmileConfiguration:
        maintainedDurationMs >= this.config.maintainedDurationMs,
      maintainedDurationMs,
      stateSinceMs: this.stateSinceMs,
      activeSinceMs: this.activeSinceMs,
      peakScore: this.peakScore,
      peakSmileLevel: this.peakSmileLevel,
    };
    return events;
  }

  suspend(
    context: DetectorSuspensionContext,
  ): readonly VisionBehaviorEvent[] {
    const events =
      this.activeSinceMs === null
        ? []
        : [
            this.endEpisode(
              context.sessionElapsedMs,
              terminationReason(context.reason),
            ),
          ];
    this.scoreFilter.reset();
    this.state = "WAITING_FOR_BASELINE";
    this.stateSinceMs = null;
    this.lastFrameAtMs = null;
    this.candidateObservations = 0;
    this.maintainedSinceMs = null;
    this.snapshot = this.emptyState();
    return events;
  }

  getState(): Readonly<SmileExpressionDetectorState> {
    return this.snapshot;
  }

  reset(): void {
    this.scoreFilter.reset();
    this.state = "WAITING_FOR_BASELINE";
    this.stateSinceMs = null;
    this.activeSinceMs = null;
    this.episodeId = null;
    this.peakScore = 0;
    this.peakSmileLevel = null;
    this.scoreSum = 0;
    this.scoreCount = 0;
    this.candidateObservations = 0;
    this.maintainedSinceMs = null;
    this.lastFrameAtMs = null;
    this.snapshot = this.emptyState();
  }

  private configurationLevel(score: number): SmileConfigurationLevel {
    if (score >= this.config.strongAbsoluteScore) {
      return "STRONG_SMILE_CONFIGURATION";
    }
    if (score >= this.config.smileAbsoluteScore) {
      return "SMILE_CONFIGURATION";
    }
    if (score >= this.config.subtleAbsoluteScore) {
      return "SUBTLE_SMILE_CONFIGURATION";
    }
    return "LOW_SMILE_CONFIGURATION";
  }

  private changeLevel(delta: number): SmileChangeLevel {
    if (delta >= this.config.strongDelta) return "STRONG_INCREASE";
    if (delta >= this.config.smileDelta) return "SMILE_INCREASE";
    if (delta >= this.config.subtleDelta) return "SUBTLE_INCREASE";
    return "NO_SIGNIFICANT_INCREASE";
  }

  private eventConfidence(
    measurement: number,
    personalization: number,
    personalized: boolean,
  ): number {
    return Math.max(
      0,
      Math.min(
        1,
        Math.min(measurement, personalized ? personalization : measurement) *
          (personalized ? 1 : 0.55),
      ),
    );
  }

  private transition(state: SmileStateName, now: number): void {
    this.state = state;
    this.stateSinceMs = now;
  }

  private resetCandidate(now: number): void {
    this.candidateObservations = 0;
    if (this.activeSinceMs === null) this.transition("IDLE", now);
  }

  private recordScore(
    score: number,
    level: SmileConfigurationLevel,
  ): void {
    if (score > this.peakScore) {
      this.peakScore = score;
      this.peakSmileLevel = level;
    }
    this.scoreSum += score;
    this.scoreCount += 1;
  }

  private endEpisode(
    now: number,
    reason: EpisodeTerminationReason,
  ): VisionBehaviorEvent {
    const start = this.activeSinceMs ?? now;
    const event = this.eventFactory.createBehaviorEvent("SMILE_ENDED", {
      confidence: this.snapshot.measurementConfidence,
      episodeId: this.episodeId,
      payload: {
        observedEndElapsedMs: now,
        durationMs: Math.max(0, now - start),
        peakSmileScore: this.peakScore,
        meanSmileScore:
          this.scoreCount === 0
            ? this.peakScore
            : this.scoreSum / this.scoreCount,
        terminationReason: reason,
      },
    });
    this.activeSinceMs = null;
    this.episodeId = null;
    this.peakScore = 0;
    this.peakSmileLevel = null;
    this.scoreSum = 0;
    this.scoreCount = 0;
    return event;
  }

  private emptyState(): SmileExpressionDetectorState {
    return {
      state: this.state,
      signalAvailable: false,
      mouthSmileLeft: null,
      mouthSmileRight: null,
      rawScore: null,
      smoothedScore: null,
      smileConfigurationScore: null,
      smileConfigurationLevel: null,
      baselineScore: null,
      baselineSmileScore: null,
      baselineSmileConfigurationLevel: null,
      baselineDelta: null,
      smileDelta: null,
      smileChangeLevel: null,
      mouthAsymmetry: null,
      measurementConfidence: 0,
      personalizationConfidence: 0,
      coachingEligible: false,
      maintainedSmileConfiguration: false,
      maintainedDurationMs: 0,
      stateSinceMs: this.stateSinceMs,
      activeSinceMs: this.activeSinceMs,
      peakScore: this.peakScore,
      peakSmileLevel: this.peakSmileLevel,
    };
  }
}
