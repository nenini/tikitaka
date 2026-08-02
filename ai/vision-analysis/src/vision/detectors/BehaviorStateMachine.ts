export const BEHAVIOR_STATES = [
  "WAITING_FOR_BASELINE",
  "NORMAL",
  "CANDIDATE",
  "ACTIVE",
  "RECOVERY_CANDIDATE",
  "COOLDOWN",
  "SUSPENDED",
] as const;

export type BehaviorState = (typeof BEHAVIOR_STATES)[number];

export interface EpisodeDurations {
  readonly wallDurationMs: number;
  readonly observedDurationMs: number;
  readonly unobservedDurationMs: number;
}

/**
 * Shared episode clock for behavior detectors.
 *
 * It deliberately does not decide detector thresholds. It only enforces the
 * common observation contract: wall time and observed time are different,
 * long frame gaps are unobserved, and a short technical suspension may resume
 * the same episode without inventing behavior during the gap.
 */
export class BehaviorEpisodeClock {
  private startElapsedMs: number | null = null;
  private lastObservedElapsedMs: number | null = null;
  private suspendedAtElapsedMs: number | null = null;
  private observedDurationMs = 0;

  start(observedStartElapsedMs: number, confirmedAtElapsedMs: number): void {
    this.startElapsedMs = observedStartElapsedMs;
    this.lastObservedElapsedMs = confirmedAtElapsedMs;
    this.suspendedAtElapsedMs = null;
    this.observedDurationMs = Math.max(
      0,
      confirmedAtElapsedMs - observedStartElapsedMs,
    );
  }

  observe(nowElapsedMs: number, maximumFrameGapMs: number): boolean {
    if (this.startElapsedMs === null) return true;
    const previous = this.lastObservedElapsedMs ?? nowElapsedMs;
    const gapMs = Math.max(0, nowElapsedMs - previous);
    if (gapMs > maximumFrameGapMs) {
      this.suspendedAtElapsedMs ??= previous;
      return false;
    }
    this.observedDurationMs += gapMs;
    this.lastObservedElapsedMs = nowElapsedMs;
    return true;
  }

  suspend(nowElapsedMs: number): void {
    if (this.startElapsedMs === null) return;
    this.suspendedAtElapsedMs ??= nowElapsedMs;
  }

  resume(nowElapsedMs: number): void {
    if (this.startElapsedMs === null) return;
    this.suspendedAtElapsedMs = null;
    this.lastObservedElapsedMs = nowElapsedMs;
  }

  suspensionDurationMs(nowElapsedMs: number): number {
    return this.suspendedAtElapsedMs === null
      ? 0
      : Math.max(0, nowElapsedMs - this.suspendedAtElapsedMs);
  }

  suspensionStartedAt(): number | null {
    return this.suspendedAtElapsedMs;
  }

  isActive(): boolean {
    return this.startElapsedMs !== null;
  }

  durations(endElapsedMs: number): EpisodeDurations {
    const start = this.startElapsedMs ?? endElapsedMs;
    const wallDurationMs = Math.max(0, endElapsedMs - start);
    const observedDurationMs = Math.min(
      wallDurationMs,
      Math.max(0, this.observedDurationMs),
    );
    return {
      wallDurationMs,
      observedDurationMs,
      unobservedDurationMs: Math.max(
        0,
        wallDurationMs - observedDurationMs,
      ),
    };
  }

  reset(): void {
    this.startElapsedMs = null;
    this.lastObservedElapsedMs = null;
    this.suspendedAtElapsedMs = null;
    this.observedDurationMs = 0;
  }
}
