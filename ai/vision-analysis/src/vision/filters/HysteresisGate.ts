export const HYSTERESIS_GATE_STATES = [
  "INACTIVE",
  "ENTRY_CANDIDATE",
  "ACTIVE",
  "RECOVERY_CANDIDATE",
] as const;

export type HysteresisGateState =
  (typeof HYSTERESIS_GATE_STATES)[number];

export type HysteresisGateTransition =
  | {
      readonly type: "ACTIVATED";
      readonly observedStartMs: number;
    }
  | {
      readonly type: "DEACTIVATED";
      readonly observedEndMs: number;
      readonly activeDurationMs: number;
    };

export interface HysteresisGateSnapshot {
  readonly state: HysteresisGateState;
  readonly active: boolean;
  readonly candidateSinceMs: number | null;
  readonly activeSinceMs: number | null;
}

/**
 * Debounces entry and recovery independently.
 *
 * The caller supplies both predicates so the uncertain band between entry and
 * recovery thresholds preserves the previous stable state.
 */
export class HysteresisGate {
  private state: HysteresisGateState = "INACTIVE";
  private candidateSinceMs: number | null = null;
  private activeSinceMs: number | null = null;
  private lastUpdateMs: number | null = null;

  constructor(
    private readonly entryDurationMs: number,
    private readonly recoveryDurationMs: number,
  ) {
    if (entryDurationMs < 0 || recoveryDurationMs < 0) {
      throw new RangeError("hysteresis durations cannot be negative");
    }
  }

  update(
    entryCondition: boolean,
    recoveryCondition: boolean,
    timestampMs: number,
  ): HysteresisGateTransition | null {
    this.assertTimestamp(timestampMs);

    switch (this.state) {
      case "INACTIVE":
        if (entryCondition) {
          this.state = "ENTRY_CANDIDATE";
          this.candidateSinceMs = timestampMs;
          return this.tryActivate(timestampMs);
        }
        return null;
      case "ENTRY_CANDIDATE":
        if (!entryCondition) {
          this.state = "INACTIVE";
          this.candidateSinceMs = null;
          return null;
        }
        return this.tryActivate(timestampMs);
      case "ACTIVE":
        if (recoveryCondition) {
          this.state = "RECOVERY_CANDIDATE";
          this.candidateSinceMs = timestampMs;
          return this.tryDeactivate(timestampMs);
        }
        return null;
      case "RECOVERY_CANDIDATE":
        if (!recoveryCondition) {
          this.state = "ACTIVE";
          this.candidateSinceMs = null;
          return null;
        }
        return this.tryDeactivate(timestampMs);
    }
  }

  forceActive(timestampMs: number): HysteresisGateTransition | null {
    this.assertTimestamp(timestampMs);
    if (this.isActive()) {
      return null;
    }

    this.state = "ACTIVE";
    this.candidateSinceMs = null;
    this.activeSinceMs = timestampMs;
    return { type: "ACTIVATED", observedStartMs: timestampMs };
  }

  forceInactive(timestampMs: number): HysteresisGateTransition | null {
    this.assertTimestamp(timestampMs);
    if (!this.isActive()) {
      this.state = "INACTIVE";
      this.candidateSinceMs = null;
      return null;
    }

    const activeSinceMs = this.activeSinceMs ?? timestampMs;
    this.state = "INACTIVE";
    this.candidateSinceMs = null;
    this.activeSinceMs = null;
    return {
      type: "DEACTIVATED",
      observedEndMs: timestampMs,
      activeDurationMs: Math.max(0, timestampMs - activeSinceMs),
    };
  }

  isActive(): boolean {
    return this.state === "ACTIVE" || this.state === "RECOVERY_CANDIDATE";
  }

  getSnapshot(): HysteresisGateSnapshot {
    return {
      state: this.state,
      active: this.isActive(),
      candidateSinceMs: this.candidateSinceMs,
      activeSinceMs: this.activeSinceMs,
    };
  }

  reset(): void {
    this.state = "INACTIVE";
    this.candidateSinceMs = null;
    this.activeSinceMs = null;
    this.lastUpdateMs = null;
  }

  private tryActivate(timestampMs: number): HysteresisGateTransition | null {
    const candidateSinceMs = this.candidateSinceMs ?? timestampMs;
    if (timestampMs - candidateSinceMs < this.entryDurationMs) {
      return null;
    }

    this.state = "ACTIVE";
    this.candidateSinceMs = null;
    this.activeSinceMs = candidateSinceMs;
    return { type: "ACTIVATED", observedStartMs: candidateSinceMs };
  }

  private tryDeactivate(timestampMs: number): HysteresisGateTransition | null {
    const candidateSinceMs = this.candidateSinceMs ?? timestampMs;
    if (timestampMs - candidateSinceMs < this.recoveryDurationMs) {
      return null;
    }

    const activeSinceMs = this.activeSinceMs ?? candidateSinceMs;
    this.state = "INACTIVE";
    this.candidateSinceMs = null;
    this.activeSinceMs = null;
    return {
      type: "DEACTIVATED",
      observedEndMs: candidateSinceMs,
      activeDurationMs: Math.max(0, candidateSinceMs - activeSinceMs),
    };
  }

  private assertTimestamp(timestampMs: number): void {
    if (!Number.isFinite(timestampMs) || timestampMs < 0) {
      throw new RangeError("timestamp must be a non-negative finite number");
    }
    if (this.lastUpdateMs !== null && timestampMs < this.lastUpdateMs) {
      throw new RangeError("hysteresis timestamps cannot move backwards");
    }
    this.lastUpdateMs = timestampMs;
  }
}

