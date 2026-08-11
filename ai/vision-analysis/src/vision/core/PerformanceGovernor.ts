import type { VisionConfig } from "../config/VisionConfig.js";
import type { PerformanceProfile } from "./NormalizedFaceFrame.js";

const PROFILE_ORDER = ["HIGH", "MEDIUM", "LOW"] as const;

export interface PerformanceObservation {
  readonly clientMonotonicMs: number;
  readonly processingDurationMs: number;
}

export interface PerformanceGovernorDecision {
  readonly profile: PerformanceProfile;
  readonly targetFps: number;
  readonly changed: boolean;
  readonly previousProfile: PerformanceProfile;
  readonly meanProcessingBudgetRatio: number;
}

interface BudgetSample {
  readonly observedAtMs: number;
  readonly ratio: number;
}

/**
 * Selects a conservative analysis profile from local processing cost only.
 *
 * A profile changes by one level at a time. Overload reacts relatively quickly,
 * while recovery requires a longer healthy window so camera-analysis load does
 * not oscillate and compete with the WebRTC call.
 */
export class PerformanceGovernor {
  private profile: PerformanceProfile;
  private samples: BudgetSample[] = [];
  private lastObservedAtMs: number | null = null;
  private lastProfileChangeAtMs: number | null = null;

  constructor(
    private readonly config: Pick<
      VisionConfig,
      "profiles" | "performanceGovernor"
    >,
    initialProfile: PerformanceProfile = "HIGH",
  ) {
    this.profile = initialProfile;
  }

  update(observation: PerformanceObservation): PerformanceGovernorDecision {
    this.assertObservation(observation);

    const previousProfile = this.profile;
    const targetFps = this.config.profiles[this.profile].targetFps;
    const frameBudgetMs = 1_000 / targetFps;
    this.samples.push({
      observedAtMs: observation.clientMonotonicMs,
      ratio: observation.processingDurationMs / frameBudgetMs,
    });
    this.lastObservedAtMs = observation.clientMonotonicMs;
    this.trimSamples(observation.clientMonotonicMs);

    const windowMs =
      this.profile === "HIGH"
        ? this.config.performanceGovernor.overloadWindowMs
        : this.selectWindowMs();
    const relevantSamples = this.samplesWithin(
      observation.clientMonotonicMs,
      windowMs,
    );
    const meanRatio = this.meanRatio(relevantSamples);

    if (
      this.hasCoveredWindow(relevantSamples, windowMs) &&
      this.cooldownElapsed(observation.clientMonotonicMs)
    ) {
      if (
        meanRatio >
        this.config.performanceGovernor.maxProcessingBudgetRatio
      ) {
        this.moveProfile(1, observation.clientMonotonicMs);
      } else if (
        meanRatio <=
          this.config.performanceGovernor.maxProcessingBudgetRatio &&
        this.profile !== "HIGH" &&
        windowMs === this.config.performanceGovernor.recoveryWindowMs
      ) {
        this.moveProfile(-1, observation.clientMonotonicMs);
      }
    }

    return {
      profile: this.profile,
      targetFps: this.config.profiles[this.profile].targetFps,
      changed: previousProfile !== this.profile,
      previousProfile,
      meanProcessingBudgetRatio: meanRatio,
    };
  }

  getProfile(): PerformanceProfile {
    return this.profile;
  }

  reset(profile: PerformanceProfile = "HIGH"): void {
    this.profile = profile;
    this.samples = [];
    this.lastObservedAtMs = null;
    this.lastProfileChangeAtMs = null;
  }

  private selectWindowMs(): number {
    const overloadSamples = this.samplesWithin(
      this.lastObservedAtMs ?? 0,
      this.config.performanceGovernor.overloadWindowMs,
    );
    const overloadMean = this.meanRatio(overloadSamples);

    // A lower profile still degrades quickly when it remains overloaded, but it
    // must remain healthy for the longer recovery window before adding work back.
    return this.hasCoveredWindow(
      overloadSamples,
      this.config.performanceGovernor.overloadWindowMs,
    ) &&
      overloadMean >
        this.config.performanceGovernor.maxProcessingBudgetRatio
      ? this.config.performanceGovernor.overloadWindowMs
      : this.config.performanceGovernor.recoveryWindowMs;
  }

  private moveProfile(direction: -1 | 1, observedAtMs: number): void {
    const currentIndex = PROFILE_ORDER.indexOf(this.profile);
    const nextIndex = Math.min(
      PROFILE_ORDER.length - 1,
      Math.max(0, currentIndex + direction),
    );
    const nextProfile = PROFILE_ORDER[nextIndex];
    if (nextProfile === undefined || nextProfile === this.profile) return;

    this.profile = nextProfile;
    this.lastProfileChangeAtMs = observedAtMs;
    // Samples measured under a different target FPS are not comparable because
    // their processing-budget denominator changes with the profile.
    this.samples = [];
  }

  private samplesWithin(nowMs: number, windowMs: number): readonly BudgetSample[] {
    const startMs = nowMs - windowMs;
    const firstWithinIndex = this.samples.findIndex(
      (sample) => sample.observedAtMs >= startMs,
    );
    if (firstWithinIndex < 0) return this.samples.slice(-1);

    // Keep one predecessor to measure the complete wall-time window even when
    // frame timestamps do not land exactly on its boundary.
    return this.samples.slice(Math.max(0, firstWithinIndex - 1));
  }

  private trimSamples(nowMs: number): void {
    const longestWindowMs = Math.max(
      this.config.performanceGovernor.overloadWindowMs,
      this.config.performanceGovernor.recoveryWindowMs,
    );
    this.samples = [...this.samplesWithin(nowMs, longestWindowMs)];
  }

  private hasCoveredWindow(
    samples: readonly BudgetSample[],
    windowMs: number,
  ): boolean {
    const first = samples[0];
    const last = samples[samples.length - 1];
    return (
      first !== undefined &&
      last !== undefined &&
      last.observedAtMs - first.observedAtMs >= windowMs
    );
  }

  private meanRatio(samples: readonly BudgetSample[]): number {
    if (samples.length === 0) return 0;
    return (
      samples.reduce((sum, sample) => sum + sample.ratio, 0) / samples.length
    );
  }

  private cooldownElapsed(observedAtMs: number): boolean {
    return (
      this.lastProfileChangeAtMs === null ||
      observedAtMs - this.lastProfileChangeAtMs >=
        this.config.performanceGovernor.profileChangeCooldownMs
    );
  }

  private assertObservation(observation: PerformanceObservation): void {
    if (
      !Number.isFinite(observation.clientMonotonicMs) ||
      observation.clientMonotonicMs < 0 ||
      (this.lastObservedAtMs !== null &&
        observation.clientMonotonicMs < this.lastObservedAtMs)
    ) {
      throw new RangeError(
        "clientMonotonicMs must be finite, non-negative, and monotonic",
      );
    }
    if (
      !Number.isFinite(observation.processingDurationMs) ||
      observation.processingDurationMs < 0
    ) {
      throw new RangeError(
        "processingDurationMs must be a non-negative finite number",
      );
    }
  }
}
