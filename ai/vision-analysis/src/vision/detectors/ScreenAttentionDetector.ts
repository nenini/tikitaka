import type { VisionConfig } from "../config/VisionConfig.js";
import type { NormalizedFaceFrame } from "../core/NormalizedFaceFrame.js";
import type {
  EpisodeTerminationReason,
  VisionBehaviorEvent,
} from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import { EmaFilter } from "../filters/EmaFilter.js";
import {
  BEHAVIOR_STATES,
  BehaviorEpisodeClock,
  type BehaviorState,
} from "./BehaviorStateMachine.js";
import type {
  DetectorSuspensionContext,
  VisionDetector,
  VisionDetectorContext,
} from "./VisionDetector.js";

export const SCREEN_ATTENTION_STATES = BEHAVIOR_STATES;
export type ScreenAttentionStateName = BehaviorState;
export type GazeMode =
  | "BINOCULAR"
  | "MONOCULAR_LEFT"
  | "MONOCULAR_RIGHT"
  | "UNAVAILABLE";
export type AttentionMode =
  | "BINOCULAR"
  | "MONOCULAR"
  | "HEAD_CENTER_ONLY"
  | "GLOBAL_POSE_ONLY"
  | "UNRELIABLE";
export type AttentionEvidenceMode =
  | "ALIGNED"
  | "CONSISTENT_DEPARTURE"
  | "HEAD_ONLY_DEPARTURE"
  | "IRIS_ONLY_DEPARTURE"
  | "HEAD_IRIS_CONFLICT"
  | "UNRELIABLE";

export interface ScreenAttentionDetectorState {
  readonly state: ScreenAttentionStateName;
  readonly rawYawDelta: number | null;
  readonly rawPitchDelta: number | null;
  readonly smoothedYawDelta: number | null;
  readonly smoothedPitchDelta: number | null;
  readonly rollDelta: number | null;
  readonly centerDeltaX: number | null;
  readonly centerDeltaY: number | null;
  readonly rawGazeHorizontalDelta: number | null;
  readonly rawGazeVerticalDelta: number | null;
  readonly smoothedGazeHorizontalDelta: number | null;
  readonly smoothedGazeVerticalDelta: number | null;
  readonly leftEyeReliability: number;
  readonly rightEyeReliability: number;
  readonly gazeReliability: number;
  readonly binocularAgreement: number | null;
  readonly gazeMode: GazeMode;
  readonly headPoseScore: number | null;
  readonly faceCenterScore: number | null;
  readonly irisProxyScore: number | null;
  /** Compatibility alias in the 0..1 range. */
  readonly eyeGazeScore: number | null;
  /** Compatibility alias in the 0..1 range. */
  readonly screenFacingScore: number | null;
  readonly screenAttentionScore: number | null;
  readonly screenAttentionConfidence: number;
  readonly attentionMode: AttentionMode;
  readonly attentionEvidenceMode: AttentionEvidenceMode;
  readonly measurementConfidence: number;
  readonly signalClarity: number;
  readonly personalizationConfidence: number;
  readonly evidenceStrength: number;
  readonly coachingEligible: boolean;
  readonly stateSinceMs: number | null;
  readonly activeSinceMs: number | null;
  readonly prolongedEmitted: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothDecreasing(
  absoluteValue: number,
  goodMaximum: number,
  badMinimum: number,
): number {
  if (absoluteValue <= goodMaximum) return 1;
  if (absoluteValue >= badMinimum) return 0;
  const t = (absoluteValue - goodMaximum) / (badMinimum - goodMaximum);
  const smoothstep = 3 * t * t - 2 * t * t * t;
  return 1 - smoothstep;
}

function terminationReason(
  reason: DetectorSuspensionContext["reason"],
): EpisodeTerminationReason {
  if (reason === "CAMERA_DISABLED") return "CAMERA_DISABLED";
  if (reason === "CONSENT_WITHDRAWN") return "CONSENT_WITHDRAWN";
  if (reason === "SESSION_ENDED") return "SESSION_ENDED";
  return "ANALYSIS_UNAVAILABLE";
}

/**
 * Combines head, center and per-eye iris proxies. Face center remains metric-only
 * evidence and can never create a departure episode by itself.
 */
export class ScreenAttentionDetector
  implements VisionDetector<NormalizedFaceFrame, ScreenAttentionDetectorState>
{
  readonly name = "ScreenAttentionDetector";
  private state: ScreenAttentionStateName = "WAITING_FOR_BASELINE";
  private stateSinceMs: number | null = null;
  private activeSinceMs: number | null = null;
  private episodeId: string | null = null;
  private prolongedEmitted = false;
  private cooldownUntilMs = 0;
  private candidateObservations = 0;
  private recoveryObservations = 0;
  private lastFrameAtMs: number | null = null;
  private suspensionWarmupUntilMs: number | null = null;
  private readonly episodeClock = new BehaviorEpisodeClock();
  private leftBlinkActive = false;
  private rightBlinkActive = false;
  private leftGazeWarmupUntilMs = 0;
  private rightGazeWarmupUntilMs = 0;
  private readonly yawFilter: EmaFilter;
  private readonly pitchFilter: EmaFilter;
  private readonly gazeHorizontalFilter: EmaFilter;
  private readonly gazeVerticalFilter: EmaFilter;
  private snapshot: ScreenAttentionDetectorState = this.emptyState();

  constructor(
    private readonly config: VisionConfig["screenAttention"],
    private readonly eventFactory: VisionEventFactory,
    private readonly behaviorPolicy: VisionConfig["behaviorPolicy"] = {
      suspensionGraceMs: 1_000,
      recoveryWarmupMs: 500,
    },
  ) {
    this.yawFilter = new EmaFilter(config.emaAlpha);
    this.pitchFilter = new EmaFilter(config.emaAlpha);
    this.gazeHorizontalFilter = new EmaFilter(config.emaAlpha);
    this.gazeVerticalFilter = new EmaFilter(config.emaAlpha);
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
    const baseline = context.baseline;
    if (
      !["READY", "PARTIAL", "GLOBAL_FALLBACK"].includes(baseline.status)
      || baseline.baselineModeBySignal.pose === "BASELINE_UNCERTAIN"
      || baseline.baselineModeBySignal.gaze === "BASELINE_UNCERTAIN"
      || baseline.baselineModeBySignal.pose === "COLLECTING"
      || baseline.baselineModeBySignal.gaze === "COLLECTING"
    ) {
      return this.suspend({
        sessionElapsedMs: frame.sessionElapsedMs,
        clientMonotonicMs: frame.clientMonotonicMs,
        reason: "ANALYSIS_UNAVAILABLE",
      });
    }

    const now = frame.sessionElapsedMs;
    const maximumFrameGapMs = Math.min(
      1_500,
      Math.max(
        1_000,
        (2.5 / Math.max(frame.processing.actualFps, 0.1)) * 1_000,
      ),
    );
    if (
      this.lastFrameAtMs !== null &&
      now - this.lastFrameAtMs > maximumFrameGapMs
    ) {
      if (this.episodeClock.isActive()) {
        this.episodeClock.suspend(this.lastFrameAtMs);
        this.transition("SUSPENDED", this.lastFrameAtMs);
      } else {
        this.candidateObservations = 0;
        this.transition("NORMAL", now);
      }
      this.resetFilters();
    }
    this.lastFrameAtMs = now;
    const face = frame.primaryFace;
    const fallback = baseline.status === "GLOBAL_FALLBACK";
    const rawYaw =
      face.yaw === null ? null : face.yaw - (fallback ? 0 : baseline.yaw);
    const rawPitch =
      face.pitch === null
        ? null
        : face.pitch - (fallback ? 0 : baseline.pitch);
    const yaw = rawYaw === null ? null : this.yawFilter.update(rawYaw);
    const pitch =
      rawPitch === null ? null : this.pitchFilter.update(rawPitch);
    const roll =
      face.roll === null
        ? null
        : face.roll - (fallback ? 0 : baseline.roll);
    const centerX = fallback
      ? face.box.centerX - 0.5
      : face.box.centerX - baseline.faceCenterX;
    const centerY = fallback
      ? face.box.centerY - 0.5
      : face.box.centerY - baseline.faceCenterY;

    this.updateBlinkState(face.blendshapes["eyeBlinkLeft"], "LEFT", now);
    this.updateBlinkState(face.blendshapes["eyeBlinkRight"], "RIGHT", now);
    const leftUsable =
      !fallback &&
      !this.leftBlinkActive &&
      now >= this.leftGazeWarmupUntilMs &&
      face.eyeGaze.left !== null &&
      baseline.leftEyeHorizontalBaseline !== null &&
      baseline.leftEyeVerticalBaseline !== null;
    const rightUsable =
      !fallback &&
      !this.rightBlinkActive &&
      now >= this.rightGazeWarmupUntilMs &&
      face.eyeGaze.right !== null &&
      baseline.rightEyeHorizontalBaseline !== null &&
      baseline.rightEyeVerticalBaseline !== null;
    const leftHorizontalDelta = leftUsable
      ? (face.eyeGaze.left?.horizontalRatio ?? 0) -
        (baseline.leftEyeHorizontalBaseline ?? 0)
      : null;
    const rightHorizontalDelta = rightUsable
      ? (face.eyeGaze.right?.horizontalRatio ?? 0) -
        (baseline.rightEyeHorizontalBaseline ?? 0)
      : null;
    const leftVerticalDelta = leftUsable
      ? (face.eyeGaze.left?.verticalRatio ?? 0) -
        (baseline.leftEyeVerticalBaseline ?? 0)
      : null;
    const rightVerticalDelta = rightUsable
      ? (face.eyeGaze.right?.verticalRatio ?? 0) -
        (baseline.rightEyeVerticalBaseline ?? 0)
      : null;
    const gazeMode: GazeMode =
      leftUsable && rightUsable
        ? "BINOCULAR"
        : leftUsable
          ? "MONOCULAR_LEFT"
          : rightUsable
            ? "MONOCULAR_RIGHT"
            : "UNAVAILABLE";
    const binocularAgreement =
      leftHorizontalDelta === null ||
      rightHorizontalDelta === null ||
      leftVerticalDelta === null ||
      rightVerticalDelta === null
        ? null
        : Math.min(
            1 -
              clamp01(
                Math.abs(leftHorizontalDelta - rightHorizontalDelta) /
                  this.config.binocularHorizontalTolerance,
              ),
            1 -
              clamp01(
                Math.abs(leftVerticalDelta - rightVerticalDelta) /
                  this.config.binocularVerticalTolerance,
              ),
          );
    const leftEyeReliability = leftUsable
      ? baseline.leftEyeBaselineConfidence *
        (binocularAgreement ?? 0.85)
      : 0;
    const rightEyeReliability = rightUsable
      ? baseline.rightEyeBaselineConfidence *
        (binocularAgreement ?? 0.85)
      : 0;
    const gazeReliability =
      gazeMode === "BINOCULAR"
        ? Math.min(leftEyeReliability, rightEyeReliability)
        : Math.max(leftEyeReliability, rightEyeReliability) * 0.85;
    const horizontalDeltas = [
      leftHorizontalDelta,
      rightHorizontalDelta,
    ].filter((value): value is number => value !== null);
    const verticalDeltas = [
      leftVerticalDelta,
      rightVerticalDelta,
    ].filter((value): value is number => value !== null);
    const rawGazeHorizontal =
      horizontalDeltas.length === 0
        ? null
        : horizontalDeltas.reduce((sum, value) => sum + value, 0) /
          horizontalDeltas.length;
    const rawGazeVertical =
      verticalDeltas.length === 0
        ? null
        : verticalDeltas.reduce((sum, value) => sum + value, 0) /
          verticalDeltas.length;
    const gazeHorizontal =
      rawGazeHorizontal === null
        ? null
        : this.gazeHorizontalFilter.update(rawGazeHorizontal);
    const gazeVertical =
      rawGazeVertical === null
        ? null
        : this.gazeVerticalFilter.update(rawGazeVertical);

    const headPoseScore =
      yaw === null && pitch === null
        ? null
        : 0.6 *
            (yaw === null
              ? 0
              : smoothDecreasing(
                  Math.abs(yaw),
                  this.config.yawRecoveryDegrees,
                  this.config.yawEntryDegrees,
                )) +
          0.4 *
            (pitch === null
              ? 0
              : smoothDecreasing(
                  Math.abs(pitch),
                  this.config.pitchRecoveryDegrees,
                  this.config.pitchEntryDegrees,
                ));
    const faceCenterScore =
      0.6 *
        smoothDecreasing(
          Math.abs(centerX),
          this.config.centerXRecoveryDelta,
          this.config.centerXEntryDelta,
        ) +
      0.4 *
        smoothDecreasing(
          Math.abs(centerY),
          this.config.centerYRecoveryDelta,
          this.config.centerYEntryDelta,
        );
    const irisProxyScore =
      gazeHorizontal === null || gazeVertical === null
        ? null
        : 0.65 *
            smoothDecreasing(
              Math.abs(gazeHorizontal),
              this.config.gazeHorizontalRecoveryDelta,
              this.config.gazeHorizontalEntryDelta,
            ) +
          0.35 *
            smoothDecreasing(
              Math.abs(gazeVertical),
              this.config.gazeVerticalRecoveryDelta,
              this.config.gazeVerticalEntryDelta,
            );
    const attentionMode: AttentionMode = fallback
      ? "GLOBAL_POSE_ONLY"
      : gazeMode === "BINOCULAR"
        ? "BINOCULAR"
        : gazeMode === "MONOCULAR_LEFT" ||
            gazeMode === "MONOCULAR_RIGHT"
          ? "MONOCULAR"
          : headPoseScore !== null
            ? "HEAD_CENTER_ONLY"
            : "UNRELIABLE";
    const screenAttentionScore = fallback
      ? headPoseScore === null
        ? null
        : 100 * headPoseScore
      : irisProxyScore === null
        ? headPoseScore === null
          ? null
          : 100 *
            (this.config.headOnlyWeight * headPoseScore +
              this.config.centerOnlyWeight * faceCenterScore)
        : headPoseScore === null
          ? 100 * irisProxyScore
          : 100 *
            (this.config.headWeight * headPoseScore +
              this.config.faceCenterWeight * faceCenterScore +
              this.config.irisWeight * irisProxyScore);

    const modeCap: Record<AttentionMode, number> = {
      BINOCULAR: 0.95,
      MONOCULAR: 0.75,
      HEAD_CENTER_ONLY: 0.65,
      GLOBAL_POSE_ONLY: 0.45,
      UNRELIABLE: 0.3,
    };
    const confidenceParts = [
      context.quality.confidence,
      face.yaw === null || face.pitch === null ? null : 0.9,
      0.85,
      irisProxyScore === null ? null : gazeReliability,
      fallback
        ? 0
        : Math.max(
            baseline.confidenceBySignal.pose,
            baseline.confidenceBySignal.gaze,
          ),
      binocularAgreement,
    ].filter((value): value is number => value !== null);
    const rawConfidence =
      confidenceParts.length === 0
        ? 0
        : confidenceParts.reduce((sum, value) => sum + value, 0) /
          confidenceParts.length;
    const screenAttentionConfidence = Math.min(
      modeCap[attentionMode],
      rawConfidence,
    );
    // Measurement quality is kept separate from policy/evidence confidence.
    // A conservative fallback may have a low event cap while its pose reading
    // is still technically clear enough to satisfy a strong-signal rule.
    const measurementConfidence =
      context.quality.confidence *
      (face.yaw !== null && face.pitch !== null ? 0.95 : 0.5);
    const headDeparture = (headPoseScore ?? 1) <= 0.2;
    const irisDeparture = (irisProxyScore ?? 1) <= 0.2;
    const directionConflict =
      headDeparture &&
      irisDeparture &&
      yaw !== null &&
      gazeHorizontal !== null &&
      Math.sign(yaw) !== 0 &&
      Math.sign(gazeHorizontal) !== 0 &&
      Math.sign(yaw) !== Math.sign(gazeHorizontal);
    const attentionEvidenceMode: AttentionEvidenceMode =
      screenAttentionConfidence < this.config.suspendedConfidenceThreshold
        ? "UNRELIABLE"
        : directionConflict
          ? "HEAD_IRIS_CONFLICT"
          : headDeparture && irisDeparture
            ? "CONSISTENT_DEPARTURE"
            : headDeparture
              ? "HEAD_ONLY_DEPARTURE"
              : irisDeparture
                ? "IRIS_ONLY_DEPARTURE"
                : "ALIGNED";
    const suspended =
      attentionEvidenceMode === "UNRELIABLE" ||
      screenAttentionScore === null ||
      measurementConfidence < this.config.suspendedConfidenceThreshold;
    if (suspended) {
      const events = this.suspend({
        sessionElapsedMs: now,
        clientMonotonicMs: frame.clientMonotonicMs,
        reason: "ANALYSIS_UNAVAILABLE",
      });
      this.snapshot = this.createSnapshot({
        rawYaw,
        rawPitch,
        yaw,
        pitch,
        roll,
        centerX,
        centerY,
        rawGazeHorizontal,
        rawGazeVertical,
        gazeHorizontal,
        gazeVertical,
        leftEyeReliability,
        rightEyeReliability,
        gazeReliability,
        binocularAgreement,
        gazeMode,
        headPoseScore,
        faceCenterScore,
        irisProxyScore,
        screenAttentionScore,
        screenAttentionConfidence,
        attentionMode,
        attentionEvidenceMode,
        measurementConfidence,
        fallback,
      });
      return events;
    }

    const fallbackEntry =
      fallback &&
      measurementConfidence >=
        this.config.fallbackMinimumMeasurementConfidence &&
      ((yaw !== null && Math.abs(yaw) >= this.config.fallbackYawDegrees) ||
        (pitch !== null &&
          Math.abs(pitch) >= this.config.fallbackPitchDegrees));
    const consistentEntry =
      attentionEvidenceMode === "CONSISTENT_DEPARTURE" &&
      screenAttentionScore <= this.config.attentionAwayScore &&
      screenAttentionConfidence >= this.config.minimumEventConfidence;
    const headOnlyEntry =
      attentionEvidenceMode === "HEAD_ONLY_DEPARTURE" &&
      (headPoseScore ?? 1) * 100 <= 20 &&
      screenAttentionConfidence >= this.config.minimumEventConfidence;
    const irisOnlyEntry =
      attentionEvidenceMode === "IRIS_ONLY_DEPARTURE" &&
      (irisProxyScore ?? 1) * 100 <= this.config.irisOnlyScore &&
      gazeReliability >= this.config.irisOnlyMinimumReliability &&
      screenAttentionConfidence >= this.config.irisOnlyMinimumConfidence;
    const entry =
      (context.quality.canStartBehavior ?? context.quality.usable) &&
      attentionEvidenceMode !== "HEAD_IRIS_CONFLICT" &&
      (fallbackEntry || consistentEntry || headOnlyEntry || irisOnlyEntry);
    const entryDuration = fallback
      ? this.config.fallbackMinimumDurationMs
      : irisOnlyEntry
        ? this.config.irisOnlyMinimumDurationMs
        : this.config.awayMinimumDurationMs;
    const entryObservations = irisOnlyEntry
      ? this.config.irisOnlyMinimumObservations
      : this.config.minimumAwayObservations;
    const recovered =
      screenAttentionScore >= this.config.attentionRecoveryScore &&
      screenAttentionConfidence >= this.config.minimumRecoveryConfidence;
    const events: VisionBehaviorEvent[] = [];

    if (this.state === "SUSPENDED") {
      const suspensionMs = this.episodeClock.suspensionDurationMs(now);
      if (
        this.episodeClock.isActive() &&
        suspensionMs > this.behaviorPolicy.suspensionGraceMs
      ) {
        const endAt = this.episodeClock.suspensionStartedAt() ?? now;
        events.push(this.endEpisode(endAt, "ANALYSIS_UNAVAILABLE"));
        this.cooldownUntilMs = now + this.config.cooldownMs;
        this.transition("COOLDOWN", now);
      } else if (this.episodeClock.isActive()) {
        this.episodeClock.resume(now);
        this.suspensionWarmupUntilMs = null;
        this.transition("ACTIVE", now);
      } else {
        this.suspensionWarmupUntilMs ??=
          now + this.behaviorPolicy.recoveryWarmupMs;
        if (now >= this.suspensionWarmupUntilMs) {
          this.suspensionWarmupUntilMs = null;
          this.transition("NORMAL", now);
        }
      }
    }
    if (this.state === "WAITING_FOR_BASELINE") {
      this.transition("NORMAL", now);
    }
    if (this.state === "COOLDOWN" && now >= this.cooldownUntilMs) {
      this.transition("NORMAL", now);
    }
    if (this.state === "NORMAL" && entry) {
      this.candidateObservations = 1;
      this.transition("CANDIDATE", now);
    } else if (this.state === "CANDIDATE") {
      if (!entry) {
        this.candidateObservations = 0;
        this.transition("NORMAL", now);
      } else {
        this.candidateObservations += 1;
        if (
          now - (this.stateSinceMs ?? now) >= entryDuration &&
          this.candidateObservations >= entryObservations
        ) {
          this.activeSinceMs = this.stateSinceMs;
          this.episodeId = this.eventFactory.createEpisodeId();
          this.episodeClock.start(this.activeSinceMs ?? now, now);
          this.transition("ACTIVE", now);
          events.push(
            this.eventFactory.createBehaviorEvent("GAZE_AWAY_STARTED", {
              confidence: screenAttentionConfidence,
              confidenceDetails: {
                measurementConfidence,
                signalClarity: screenAttentionConfidence,
                personalizationConfidence: fallback ? 0 : 1,
                evidenceStrength: screenAttentionConfidence,
                baselineMode: fallback
                  ? "GLOBAL_FALLBACK"
                  : baseline.baselineModeBySignal.gaze,
                coachingEligible:
                  !fallback && screenAttentionConfidence >= 0.75,
                baselineEpoch: baseline.baselineEpoch,
              },
              episodeId: this.episodeId,
              payload: {
                observedStartElapsedMs: this.activeSinceMs ?? now,
                yawDelta: yaw,
                pitchDelta: pitch,
                rollDelta: roll,
                centerDeltaX: centerX,
                centerDeltaY: centerY,
                gazeHorizontalDelta: gazeHorizontal,
                gazeVerticalDelta: gazeVertical,
              },
            }),
          );
        }
      }
    } else if (this.state === "ACTIVE") {
      if (!this.episodeClock.observe(now, maximumFrameGapMs)) {
        this.transition(
          "SUSPENDED",
          this.episodeClock.suspensionStartedAt() ?? now,
        );
      }
      if (
        this.state === "ACTIVE" &&
        !this.prolongedEmitted &&
        this.episodeClock.durations(now).observedDurationMs >=
          this.config.prolongedDurationMs
      ) {
        this.prolongedEmitted = true;
        events.push(
          this.eventFactory.createBehaviorEvent("PROLONGED_GAZE_AWAY", {
            confidence: screenAttentionConfidence,
            confidenceDetails: {
              measurementConfidence,
              signalClarity: screenAttentionConfidence,
              personalizationConfidence: fallback ? 0 : 1,
              evidenceStrength: screenAttentionConfidence,
              baselineMode: fallback
                ? "GLOBAL_FALLBACK"
                : baseline.baselineModeBySignal.gaze,
              coachingEligible:
                !fallback && screenAttentionConfidence >= 0.75,
              baselineEpoch: baseline.baselineEpoch,
            },
            episodeId: this.episodeId,
            payload: {
              activeDurationMs:
                this.episodeClock.durations(now).observedDurationMs,
              yawDelta: yaw,
              pitchDelta: pitch,
              gazeHorizontalDelta: gazeHorizontal,
              gazeVerticalDelta: gazeVertical,
            },
          }),
        );
      }
      if (this.state === "ACTIVE" && recovered) {
        this.recoveryObservations = 1;
        this.transition("RECOVERY_CANDIDATE", now);
      }
    } else if (this.state === "RECOVERY_CANDIDATE") {
      if (!recovered) {
        this.recoveryObservations = 0;
        this.transition("ACTIVE", now);
      } else {
        this.episodeClock.observe(now, maximumFrameGapMs);
        this.recoveryObservations += 1;
        if (
          now - (this.stateSinceMs ?? now) >=
            this.config.recoveryMinimumDurationMs &&
          this.recoveryObservations >=
            this.config.minimumRecoveryObservations
        ) {
          events.push(this.endEpisode(now, "RECOVERED"));
          this.cooldownUntilMs = now + this.config.cooldownMs;
          this.transition("COOLDOWN", now);
        }
      }
    }

    this.snapshot = this.createSnapshot({
      rawYaw,
      rawPitch,
      yaw,
      pitch,
      roll,
      centerX,
      centerY,
      rawGazeHorizontal,
      rawGazeVertical,
      gazeHorizontal,
      gazeVertical,
      leftEyeReliability,
      rightEyeReliability,
      gazeReliability,
      binocularAgreement,
      gazeMode,
      headPoseScore,
      faceCenterScore,
      irisProxyScore,
      screenAttentionScore,
      screenAttentionConfidence,
      attentionMode,
      attentionEvidenceMode,
      measurementConfidence,
      fallback,
    });
    return events;
  }

  suspend(
    context: DetectorSuspensionContext,
  ): readonly VisionBehaviorEvent[] {
    const events: VisionBehaviorEvent[] = [];
    const immediate =
      context.reason === "CAMERA_DISABLED" ||
      context.reason === "CONSENT_WITHDRAWN" ||
      context.reason === "SESSION_ENDED";
    if (this.episodeClock.isActive()) {
      this.episodeClock.suspend(
        context.suspensionStartedElapsedMs ?? context.sessionElapsedMs,
      );
      if (
        immediate ||
        this.episodeClock.suspensionDurationMs(context.sessionElapsedMs) >
          this.behaviorPolicy.suspensionGraceMs
      ) {
        const endAt = immediate
          ? context.sessionElapsedMs
          : (this.episodeClock.suspensionStartedAt() ??
            context.sessionElapsedMs);
        events.push(
          this.endEpisode(endAt, terminationReason(context.reason)),
        );
      }
    }
    this.resetFilters();
    this.state = immediate ? "WAITING_FOR_BASELINE" : "SUSPENDED";
    this.stateSinceMs = context.sessionElapsedMs;
    this.candidateObservations = 0;
    this.recoveryObservations = 0;
    this.suspensionWarmupUntilMs = null;
    this.snapshot = this.emptyState();
    return events;
  }

  getState(): Readonly<ScreenAttentionDetectorState> {
    return this.snapshot;
  }

  reset(): void {
    this.resetFilters();
    this.state = "WAITING_FOR_BASELINE";
    this.stateSinceMs = null;
    this.activeSinceMs = null;
    this.episodeId = null;
    this.prolongedEmitted = false;
    this.cooldownUntilMs = 0;
    this.candidateObservations = 0;
    this.recoveryObservations = 0;
    this.lastFrameAtMs = null;
    this.suspensionWarmupUntilMs = null;
    this.episodeClock.reset();
    this.leftBlinkActive = false;
    this.rightBlinkActive = false;
    this.leftGazeWarmupUntilMs = 0;
    this.rightGazeWarmupUntilMs = 0;
    this.snapshot = this.emptyState();
  }

  private updateBlinkState(
    score: number | undefined,
    eye: "LEFT" | "RIGHT",
    now: number,
  ): void {
    const active = eye === "LEFT" ? this.leftBlinkActive : this.rightBlinkActive;
    let next = active;
    if (score === undefined) next = true;
    else if (!active && score >= this.config.blinkEntryScore) next = true;
    else if (active && score <= this.config.blinkRecoveryScore) next = false;
    if (active && !next) {
      if (eye === "LEFT") {
        this.leftGazeWarmupUntilMs = now + this.config.blinkRecoveryWarmupMs;
      } else {
        this.rightGazeWarmupUntilMs = now + this.config.blinkRecoveryWarmupMs;
      }
    }
    if (eye === "LEFT") this.leftBlinkActive = next;
    else this.rightBlinkActive = next;
  }

  private transition(state: ScreenAttentionStateName, now: number): void {
    this.state = state;
    this.stateSinceMs = now;
  }

  private endEpisode(
    now: number,
    reason: EpisodeTerminationReason,
  ): VisionBehaviorEvent {
    const durations = this.episodeClock.durations(now);
    const event = this.eventFactory.createBehaviorEvent("GAZE_AWAY_ENDED", {
      confidence: this.snapshot.screenAttentionConfidence,
      episodeId: this.episodeId,
      payload: {
        observedEndElapsedMs: now,
        ...durations,
        terminationReason: reason,
      },
    });
    this.activeSinceMs = null;
    this.episodeId = null;
    this.prolongedEmitted = false;
    this.episodeClock.reset();
    return event;
  }

  private resetFilters(): void {
    this.yawFilter.reset();
    this.pitchFilter.reset();
    this.gazeHorizontalFilter.reset();
    this.gazeVerticalFilter.reset();
  }

  private createSnapshot(values: {
    rawYaw: number | null;
    rawPitch: number | null;
    yaw: number | null;
    pitch: number | null;
    roll: number | null;
    centerX: number;
    centerY: number;
    rawGazeHorizontal: number | null;
    rawGazeVertical: number | null;
    gazeHorizontal: number | null;
    gazeVertical: number | null;
    leftEyeReliability: number;
    rightEyeReliability: number;
    gazeReliability: number;
    binocularAgreement: number | null;
    gazeMode: GazeMode;
    headPoseScore: number | null;
    faceCenterScore: number;
    irisProxyScore: number | null;
    screenAttentionScore: number | null;
    screenAttentionConfidence: number;
    attentionMode: AttentionMode;
    attentionEvidenceMode: AttentionEvidenceMode;
    measurementConfidence: number;
    fallback: boolean;
  }): ScreenAttentionDetectorState {
    return {
      state: this.state,
      rawYawDelta: values.rawYaw,
      rawPitchDelta: values.rawPitch,
      smoothedYawDelta: values.yaw,
      smoothedPitchDelta: values.pitch,
      rollDelta: values.roll,
      centerDeltaX: values.centerX,
      centerDeltaY: values.centerY,
      rawGazeHorizontalDelta: values.rawGazeHorizontal,
      rawGazeVerticalDelta: values.rawGazeVertical,
      smoothedGazeHorizontalDelta: values.gazeHorizontal,
      smoothedGazeVerticalDelta: values.gazeVertical,
      leftEyeReliability: values.leftEyeReliability,
      rightEyeReliability: values.rightEyeReliability,
      gazeReliability: values.gazeReliability,
      binocularAgreement: values.binocularAgreement,
      gazeMode: values.gazeMode,
      headPoseScore: values.headPoseScore,
      faceCenterScore: values.faceCenterScore,
      irisProxyScore: values.irisProxyScore,
      eyeGazeScore: values.irisProxyScore,
      screenFacingScore:
        values.screenAttentionScore === null
          ? null
          : values.screenAttentionScore / 100,
      screenAttentionScore: values.screenAttentionScore,
      screenAttentionConfidence: values.screenAttentionConfidence,
      attentionMode: values.attentionMode,
      attentionEvidenceMode: values.attentionEvidenceMode,
      measurementConfidence: values.measurementConfidence,
      signalClarity: values.screenAttentionConfidence,
      personalizationConfidence: values.fallback ? 0 : 1,
      evidenceStrength: values.screenAttentionConfidence,
      coachingEligible: !values.fallback,
      stateSinceMs: this.stateSinceMs,
      activeSinceMs: this.activeSinceMs,
      prolongedEmitted: this.prolongedEmitted,
    };
  }

  private emptyState(): ScreenAttentionDetectorState {
    return {
      state: this.state,
      rawYawDelta: null,
      rawPitchDelta: null,
      smoothedYawDelta: null,
      smoothedPitchDelta: null,
      rollDelta: null,
      centerDeltaX: null,
      centerDeltaY: null,
      rawGazeHorizontalDelta: null,
      rawGazeVerticalDelta: null,
      smoothedGazeHorizontalDelta: null,
      smoothedGazeVerticalDelta: null,
      leftEyeReliability: 0,
      rightEyeReliability: 0,
      gazeReliability: 0,
      binocularAgreement: null,
      gazeMode: "UNAVAILABLE",
      headPoseScore: null,
      faceCenterScore: null,
      irisProxyScore: null,
      eyeGazeScore: null,
      screenFacingScore: null,
      screenAttentionScore: null,
      screenAttentionConfidence: 0,
      attentionMode: "UNRELIABLE",
      attentionEvidenceMode: "UNRELIABLE",
      measurementConfidence: 0,
      signalClarity: 0,
      personalizationConfidence: 0,
      evidenceStrength: 0,
      coachingEligible: false,
      stateSinceMs: this.stateSinceMs,
      activeSinceMs: this.activeSinceMs,
      prolongedEmitted: this.prolongedEmitted,
    };
  }
}
