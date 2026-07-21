import type { VisionConfig } from "../config/VisionConfig.js";
import type { NormalizedFaceFrame } from "../core/NormalizedFaceFrame.js";
import type { EpisodeTerminationReason, VisionBehaviorEvent } from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import { EmaFilter } from "../filters/EmaFilter.js";
import type { DetectorSuspensionContext, VisionDetector, VisionDetectorContext } from "./VisionDetector.js";

export const SCREEN_ATTENTION_STATES = ["WAITING_FOR_BASELINE", "NORMAL", "AWAY_CANDIDATE", "AWAY_ACTIVE", "RECOVERY_CANDIDATE", "COOLDOWN"] as const;
export type ScreenAttentionStateName = (typeof SCREEN_ATTENTION_STATES)[number];

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
  readonly eyeGazeScore: number | null;
  readonly screenFacingScore: number | null;
  readonly stateSinceMs: number | null;
  readonly activeSinceMs: number | null;
  readonly prolongedEmitted: boolean;
}

function terminationReason(reason: DetectorSuspensionContext["reason"]): EpisodeTerminationReason {
  if (reason === "CONSENT_WITHDRAWN") return "CONSENT_WITHDRAWN";
  if (reason === "SESSION_ENDED") return "SESSION_ENDED";
  return "ANALYSIS_UNAVAILABLE";
}

/**
 * Detects sustained screen-facing departure using head, face-center, and iris
 * proxies. It does not claim the exact point or person being viewed.
 */
export class ScreenAttentionDetector implements VisionDetector<NormalizedFaceFrame, ScreenAttentionDetectorState> {
  readonly name = "ScreenAttentionDetector";
  private state: ScreenAttentionStateName = "WAITING_FOR_BASELINE";
  private stateSinceMs: number | null = null;
  private activeSinceMs: number | null = null;
  private episodeId: string | null = null;
  private prolongedEmitted = false;
  private cooldownUntilMs = 0;
  private readonly yawFilter: EmaFilter;
  private readonly pitchFilter: EmaFilter;
  private readonly gazeHorizontalFilter: EmaFilter;
  private readonly gazeVerticalFilter: EmaFilter;
  private snapshot: ScreenAttentionDetectorState = this.emptyState();

  constructor(private readonly config: VisionConfig["screenAttention"], private readonly eventFactory: VisionEventFactory) {
    this.yawFilter = new EmaFilter(config.emaAlpha);
    this.pitchFilter = new EmaFilter(config.emaAlpha);
    this.gazeHorizontalFilter = new EmaFilter(config.emaAlpha);
    this.gazeVerticalFilter = new EmaFilter(config.emaAlpha);
  }

  update(frame: NormalizedFaceFrame, context: VisionDetectorContext): readonly VisionBehaviorEvent[] {
    if (!context.quality.usable || frame.primaryFace === null) {
      return this.suspend({ sessionElapsedMs: frame.sessionElapsedMs, clientMonotonicMs: frame.clientMonotonicMs, reason: "ANALYSIS_UNAVAILABLE" });
    }
    const baseline = context.baseline;
    if (baseline.status !== "READY" && baseline.status !== "FALLBACK") {
      this.state = "WAITING_FOR_BASELINE";
      this.snapshot = this.emptyState();
      return [];
    }
    const face = frame.primaryFace;
    const rawYaw = face.yaw === null ? null : face.yaw - baseline.yaw;
    const rawPitch = face.pitch === null ? null : face.pitch - baseline.pitch;
    const yaw = rawYaw === null ? null : this.yawFilter.update(rawYaw);
    const pitch = rawPitch === null ? null : this.pitchFilter.update(rawPitch);
    const roll = face.roll === null ? null : face.roll - baseline.roll;
    const centerX = face.box.centerX - baseline.faceCenterX;
    const centerY = face.box.centerY - baseline.faceCenterY;
    const maximumBlink = Math.max(
      face.blendshapes["eyeBlinkLeft"] ?? 0,
      face.blendshapes["eyeBlinkRight"] ?? 0,
    );
    const gazeReliable =
      face.eyeGaze.horizontalRatio !== null &&
      face.eyeGaze.verticalRatio !== null &&
      face.eyeGaze.binocularAgreementScore !== null &&
      face.eyeGaze.binocularAgreementScore >=
        this.config.minimumBinocularAgreementScore &&
      maximumBlink <= this.config.maximumEyeBlinkScore;
    // Blinked or mutually inconsistent eyes are excluded instead of being
    // interpreted as looking away.
    const rawGazeHorizontal =
      gazeReliable && baseline.eyeGazeHorizontalRatio !== null
        ? (face.eyeGaze.horizontalRatio ?? 0) -
          baseline.eyeGazeHorizontalRatio
        : null;
    const rawGazeVertical =
      gazeReliable && baseline.eyeGazeVerticalRatio !== null
        ? (face.eyeGaze.verticalRatio ?? 0) - baseline.eyeGazeVerticalRatio
        : null;
    const gazeHorizontal =
      rawGazeHorizontal === null
        ? null
        : this.gazeHorizontalFilter.update(rawGazeHorizontal);
    const gazeVertical =
      rawGazeVertical === null
        ? null
        : this.gazeVerticalFilter.update(rawGazeVertical);
    const entry = (yaw !== null && Math.abs(yaw) > this.config.yawEntryDegrees) ||
      (pitch !== null && Math.abs(pitch) > this.config.pitchEntryDegrees) ||
      Math.abs(centerX) > this.config.centerXEntryDelta ||
      Math.abs(centerY) > this.config.centerYEntryDelta ||
      (gazeHorizontal !== null &&
        Math.abs(gazeHorizontal) > this.config.gazeHorizontalEntryDelta) ||
      (gazeVertical !== null &&
        Math.abs(gazeVertical) > this.config.gazeVerticalEntryDelta);
    const recovered = (yaw === null || Math.abs(yaw) < this.config.yawRecoveryDegrees) &&
      (pitch === null || Math.abs(pitch) < this.config.pitchRecoveryDegrees) &&
      Math.abs(centerX) < this.config.centerXRecoveryDelta &&
      Math.abs(centerY) < this.config.centerYRecoveryDelta &&
      (gazeHorizontal === null ||
        Math.abs(gazeHorizontal) < this.config.gazeHorizontalRecoveryDelta) &&
      (gazeVertical === null ||
        Math.abs(gazeVertical) < this.config.gazeVerticalRecoveryDelta);
    const now = frame.sessionElapsedMs;
    const events: VisionBehaviorEvent[] = [];

    if (this.state === "WAITING_FOR_BASELINE") this.transition("NORMAL", now);
    if (this.state === "COOLDOWN" && now >= this.cooldownUntilMs) this.transition("NORMAL", now);
    if (this.state === "NORMAL" && entry) this.transition("AWAY_CANDIDATE", now);
    else if (this.state === "AWAY_CANDIDATE") {
      if (!entry) this.transition("NORMAL", now);
      else if (now - (this.stateSinceMs ?? now) >= this.config.awayMinimumDurationMs) {
        this.activeSinceMs = this.stateSinceMs;
        this.episodeId = this.eventFactory.createEpisodeId();
        this.transition("AWAY_ACTIVE", now);
        events.push(this.eventFactory.createBehaviorEvent("GAZE_AWAY_STARTED", {
          confidence: this.config.defaultEventConfidence,
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
        }));
      }
    } else if (this.state === "AWAY_ACTIVE") {
      if (!this.prolongedEmitted && now - (this.activeSinceMs ?? now) >= this.config.prolongedDurationMs) {
        this.prolongedEmitted = true;
        events.push(this.eventFactory.createBehaviorEvent("PROLONGED_GAZE_AWAY", {
          confidence: this.config.defaultEventConfidence,
          episodeId: this.episodeId,
          payload: {
            activeDurationMs: now - (this.activeSinceMs ?? now),
            yawDelta: yaw,
            pitchDelta: pitch,
            gazeHorizontalDelta: gazeHorizontal,
            gazeVerticalDelta: gazeVertical,
          },
        }));
      }
      if (recovered) this.transition("RECOVERY_CANDIDATE", now);
    } else if (this.state === "RECOVERY_CANDIDATE") {
      if (!recovered) this.transition("AWAY_ACTIVE", now);
      else if (now - (this.stateSinceMs ?? now) >= this.config.recoveryMinimumDurationMs) {
        events.push(this.endEpisode(now, "RECOVERED"));
        this.cooldownUntilMs = now + this.config.cooldownMs;
        this.transition("COOLDOWN", now);
      }
    }

    const maximumRatio = Math.max(
      Math.abs(yaw ?? 0) / this.config.yawEntryDegrees,
      Math.abs(pitch ?? 0) / this.config.pitchEntryDegrees,
      Math.abs(centerX) / this.config.centerXEntryDelta,
      Math.abs(centerY) / this.config.centerYEntryDelta,
      Math.abs(gazeHorizontal ?? 0) / this.config.gazeHorizontalEntryDelta,
      Math.abs(gazeVertical ?? 0) / this.config.gazeVerticalEntryDelta,
    );
    const maximumGazeRatio = Math.max(
      Math.abs(gazeHorizontal ?? 0) / this.config.gazeHorizontalEntryDelta,
      Math.abs(gazeVertical ?? 0) / this.config.gazeVerticalEntryDelta,
    );
    this.snapshot = {
      state: this.state, rawYawDelta: rawYaw, rawPitchDelta: rawPitch,
      smoothedYawDelta: yaw, smoothedPitchDelta: pitch, rollDelta: roll,
      centerDeltaX: centerX, centerDeltaY: centerY,
      rawGazeHorizontalDelta: rawGazeHorizontal,
      rawGazeVerticalDelta: rawGazeVertical,
      smoothedGazeHorizontalDelta: gazeHorizontal,
      smoothedGazeVerticalDelta: gazeVertical,
      eyeGazeScore:
        gazeHorizontal === null && gazeVertical === null
          ? null
          : Math.max(0, Math.min(1, 1 - maximumGazeRatio)),
      screenFacingScore: Math.max(0, Math.min(1, 1 - maximumRatio)),
      stateSinceMs: this.stateSinceMs, activeSinceMs: this.activeSinceMs,
      prolongedEmitted: this.prolongedEmitted,
    };
    return events;
  }

  suspend(context: DetectorSuspensionContext): readonly VisionBehaviorEvent[] {
    const events = this.activeSinceMs === null ? [] : [this.endEpisode(context.sessionElapsedMs, terminationReason(context.reason))];
    this.yawFilter.reset();
    this.pitchFilter.reset();
    this.gazeHorizontalFilter.reset();
    this.gazeVerticalFilter.reset();
    this.state = "WAITING_FOR_BASELINE";
    this.stateSinceMs = null;
    this.snapshot = this.emptyState();
    return events;
  }

  getState(): Readonly<ScreenAttentionDetectorState> { return this.snapshot; }

  reset(): void {
    this.yawFilter.reset(); this.pitchFilter.reset();
    this.gazeHorizontalFilter.reset(); this.gazeVerticalFilter.reset();
    this.state = "WAITING_FOR_BASELINE"; this.stateSinceMs = null; this.activeSinceMs = null;
    this.episodeId = null; this.prolongedEmitted = false; this.cooldownUntilMs = 0; this.snapshot = this.emptyState();
  }

  private transition(state: ScreenAttentionStateName, now: number): void { this.state = state; this.stateSinceMs = now; }

  private endEpisode(now: number, reason: EpisodeTerminationReason): VisionBehaviorEvent {
    const start = this.activeSinceMs ?? now;
    const event = this.eventFactory.createBehaviorEvent("GAZE_AWAY_ENDED", {
      confidence: this.config.defaultEventConfidence, episodeId: this.episodeId,
      payload: { observedEndElapsedMs: now, durationMs: Math.max(0, now - start), terminationReason: reason },
    });
    this.activeSinceMs = null; this.episodeId = null; this.prolongedEmitted = false;
    return event;
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
      eyeGazeScore: null,
      screenFacingScore: null,
      stateSinceMs: this.stateSinceMs,
      activeSinceMs: this.activeSinceMs,
      prolongedEmitted: this.prolongedEmitted,
    };
  }
}
