import type { VisionConfig } from "../config/VisionConfig.js";
import type { NormalizedFaceFrame } from "../core/NormalizedFaceFrame.js";
import type { VisionBehaviorEvent } from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import { EmaFilter } from "../filters/EmaFilter.js";
import type {
  DetectorSuspensionContext,
  VisionDetector,
  VisionDetectorContext,
} from "./VisionDetector.js";

export const NOD_STATES = [
  "WAITING_FOR_BASELINE",
  "IDLE",
  "DOWN_CANDIDATE",
  "DOWN_ACTIVE",
  "RETURNING",
  "COOLDOWN",
] as const;

export type NodStateName = (typeof NOD_STATES)[number];

export interface NodDetectorState {
  readonly state: NodStateName;
  readonly rawPitchDelta: number | null;
  readonly smoothedPitchDelta: number | null;
  readonly downwardDelta: number | null;
  readonly peakAmplitudeDegrees: number;
  readonly movementStartedAtMs: number | null;
  readonly stateSinceMs: number | null;
  readonly cooldownUntilMs: number;
}

/** Detects one conservative down-and-return pitch cycle without inferring intent. */
export class NodDetector
  implements VisionDetector<NormalizedFaceFrame, NodDetectorState>
{
  readonly name = "NodDetector";
  // Timing anchors are stored separately because each stroke has independent
  // duration requirements and contributes to the emitted event payload.
  private state: NodStateName = "WAITING_FOR_BASELINE";
  private stateSinceMs: number | null = null;
  private movementStartedAtMs: number | null = null;
  private downActiveAtMs: number | null = null;
  private returningAtMs: number | null = null;
  private lastNeutralAtMs: number | null = null;
  private cooldownUntilMs = 0;
  private peakAmplitudeDegrees = 0;
  private readonly pitchFilter: EmaFilter;
  private snapshot: NodDetectorState = this.emptyState();

  constructor(
    private readonly config: VisionConfig["nod"],
    private readonly eventFactory: VisionEventFactory,
  ) {
    this.pitchFilter = new EmaFilter(config.emaAlpha);
  }

  update(
    frame: NormalizedFaceFrame,
    context: VisionDetectorContext,
  ): readonly VisionBehaviorEvent[] {
    // Missing pose or unusable quality breaks the motion sequence. Joining
    // samples across that gap would create a synthetic nod.
    if (
      !context.quality.usable ||
      frame.primaryFace === null ||
      frame.primaryFace.pitch === null
    ) {
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
      // A nod is measured relative to the user's calibrated neutral pitch.
      this.resetTracking("WAITING_FOR_BASELINE");
      return [];
    }

    const now = frame.sessionElapsedMs;
    const rawDelta = frame.primaryFace.pitch - context.baseline.pitch;
    const smoothedDelta = this.pitchFilter.update(rawDelta);
    // Pitch-axis sign is configuration because MediaPipe camera conventions
    // must be validated with real mirrored/unmirrored device recordings.
    const downwardDelta = smoothedDelta * this.config.downwardPitchSign;
    const events: VisionBehaviorEvent[] = [];

    if (this.state === "WAITING_FOR_BASELINE") this.transition("IDLE", now);
    if (this.state === "COOLDOWN") {
      // Ignore all motion during cooldown so one natural cycle cannot be counted twice.
      if (now < this.cooldownUntilMs) {
        this.updateSnapshot(rawDelta, smoothedDelta, downwardDelta);
        return [];
      }
      this.transition("IDLE", now);
    }

    if (this.state === "IDLE") {
      if (Math.abs(downwardDelta) <= this.config.returnToleranceDegrees) {
        // A recent neutral sample is required before accepting a downward stroke.
        this.lastNeutralAtMs = now;
      } else if (
        downwardDelta >= this.config.minimumAmplitudeDegrees &&
        downwardDelta <= this.config.maximumAmplitudeDegrees &&
        this.lastNeutralAtMs !== null
      ) {
        this.movementStartedAtMs = this.lastNeutralAtMs;
        this.peakAmplitudeDegrees = downwardDelta;
        this.transition("DOWN_CANDIDATE", now);
      }
    } else if (this.state === "DOWN_CANDIDATE") {
      // Track the peak but defer activation until amplitude and downstroke time
      // both prove that this is more than a single-frame pose spike.
      this.peakAmplitudeDegrees = Math.max(
        this.peakAmplitudeDegrees,
        downwardDelta,
      );
      if (
        downwardDelta > this.config.maximumAmplitudeDegrees ||
        downwardDelta < 0 ||
        this.exceededMaximumDuration(now)
      ) {
        this.abortMovement(now);
      } else if (
        downwardDelta <= this.config.returnToleranceDegrees &&
        now - (this.movementStartedAtMs ?? now) <
          this.config.minimumDownstrokeMs
      ) {
        // A brief excursion that returns before a downstroke is not a nod.
        this.abortMovement(now);
      } else if (
        now - (this.movementStartedAtMs ?? now) >=
          this.config.minimumDownstrokeMs &&
        downwardDelta >= this.config.minimumAmplitudeDegrees &&
        this.peakAmplitudeDegrees >= this.config.minimumAmplitudeDegrees
      ) {
        this.downActiveAtMs = now;
        this.transition("DOWN_ACTIVE", now);
      }
    } else if (this.state === "DOWN_ACTIVE") {
      this.peakAmplitudeDegrees = Math.max(
        this.peakAmplitudeDegrees,
        downwardDelta,
      );
      if (
        downwardDelta > this.config.maximumAmplitudeDegrees ||
        this.exceededMaximumDuration(now) ||
        now - (this.downActiveAtMs ?? now) > this.config.maximumDownHoldMs
      ) {
        this.abortMovement(now);
      } else if (
        downwardDelta <=
        this.peakAmplitudeDegrees - this.config.minimumReversalDegrees
      ) {
        // Only a material reversal advances the cycle toward a possible nod.
        this.returningAtMs = now;
        this.transition("RETURNING", now);
      }
    } else if (this.state === "RETURNING") {
      // Overshoot in the opposite direction or excessive total duration is
      // treated as posture change rather than a compact nod cycle.
      if (
        this.exceededMaximumDuration(now) ||
        downwardDelta < -this.config.returnToleranceDegrees
      ) {
        this.abortMovement(now);
      } else if (
        Math.abs(downwardDelta) <= this.config.returnToleranceDegrees
      ) {
        const durationMs = now - (this.movementStartedAtMs ?? now);
        const upstrokeMs = now - (this.returningAtMs ?? now);
        if (
          durationMs >= this.config.minimumDurationMs &&
          durationMs <= this.config.maximumDurationMs &&
          upstrokeMs >= this.config.minimumUpstrokeMs
        ) {
          // Emit only after the face returns to baseline and both strokes meet
          // their duration constraints; no partial-cycle event is published.
          events.push(
            this.eventFactory.createBehaviorEvent("NOD_EVENT", {
              confidence: this.config.defaultEventConfidence,
              episodeId: null,
              payload: {
                amplitudeDegrees: this.peakAmplitudeDegrees,
                durationMs,
                downstrokeMs:
                  (this.downActiveAtMs ?? now) -
                  (this.movementStartedAtMs ?? now),
                upstrokeMs,
              },
            }),
          );
          this.enterCooldown(now);
        } else {
          this.abortMovement(now);
        }
      }
    }

    this.updateSnapshot(rawDelta, smoothedDelta, downwardDelta);
    return events;
  }

  suspend(
    _context: DetectorSuspensionContext,
  ): readonly VisionBehaviorEvent[] {
    // Nods are atomic events, so an interrupted partial cycle is discarded.
    this.pitchFilter.reset();
    this.resetTracking("WAITING_FOR_BASELINE");
    return [];
  }

  getState(): Readonly<NodDetectorState> {
    return this.snapshot;
  }

  reset(): void {
    // All pose, timing, and cooldown state is session-local.
    this.pitchFilter.reset();
    this.cooldownUntilMs = 0;
    this.resetTracking("WAITING_FOR_BASELINE");
  }

  private exceededMaximumDuration(now: number): boolean {
    return (
      now - (this.movementStartedAtMs ?? now) >
      this.config.maximumDurationMs
    );
  }

  private abortMovement(now: number): void {
    // Requiring a fresh neutral observation prevents an invalid cycle from
    // immediately reusing its final sample as the start of another candidate.
    this.clearMovement();
    this.lastNeutralAtMs = null;
    this.transition("IDLE", now);
  }

  private enterCooldown(now: number): void {
    // Cooldown begins only after one fully emitted cycle.
    this.clearMovement();
    this.lastNeutralAtMs = null;
    this.cooldownUntilMs = now + this.config.cooldownMs;
    this.transition("COOLDOWN", now);
  }

  private clearMovement(): void {
    this.movementStartedAtMs = null;
    this.downActiveAtMs = null;
    this.returningAtMs = null;
    this.peakAmplitudeDegrees = 0;
  }

  private resetTracking(state: NodStateName): void {
    this.clearMovement();
    this.lastNeutralAtMs = null;
    this.state = state;
    this.stateSinceMs = null;
    this.snapshot = this.emptyState();
  }

  private transition(state: NodStateName, now: number): void {
    this.state = state;
    this.stateSinceMs = now;
  }

  private updateSnapshot(
    rawPitchDelta: number,
    smoothedPitchDelta: number,
    downwardDelta: number,
  ): void {
    this.snapshot = {
      state: this.state,
      rawPitchDelta,
      smoothedPitchDelta,
      downwardDelta,
      peakAmplitudeDegrees: this.peakAmplitudeDegrees,
      movementStartedAtMs: this.movementStartedAtMs,
      stateSinceMs: this.stateSinceMs,
      cooldownUntilMs: this.cooldownUntilMs,
    };
  }

  private emptyState(): NodDetectorState {
    return {
      state: this.state,
      rawPitchDelta: null,
      smoothedPitchDelta: null,
      downwardDelta: null,
      peakAmplitudeDegrees: this.peakAmplitudeDegrees,
      movementStartedAtMs: this.movementStartedAtMs,
      stateSinceMs: this.stateSinceMs,
      cooldownUntilMs: this.cooldownUntilMs,
    };
  }
}
