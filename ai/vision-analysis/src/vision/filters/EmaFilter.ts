/** Exponential moving average used to suppress single-frame detector spikes. */
export class EmaFilter {
  private value: number | null = null;

  constructor(private readonly alpha: number) {
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      throw new RangeError("alpha must be in (0, 1]");
    }
  }

  update(next: number): number {
    if (!Number.isFinite(next)) throw new RangeError("next must be finite");
    this.value = this.value === null ? next : this.alpha * next + (1 - this.alpha) * this.value;
    return this.value;
  }

  getValue(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/**
 * Time-based EMA whose response is stable across different detector FPS values.
 * The first sample initializes the filter and non-increasing timestamps are
 * rejected so an out-of-order frame cannot distort the configured half-life.
 */
export class TimeBasedEmaFilter {
  private value: number | null = null;
  private lastTimestampMs: number | null = null;

  constructor(private readonly halfLifeMs: number) {
    if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) {
      throw new RangeError("halfLifeMs must be positive and finite");
    }
  }

  update(next: number, timestampMs: number): number {
    if (!Number.isFinite(next) || !Number.isFinite(timestampMs)) {
      throw new RangeError("EMA input and timestamp must be finite");
    }
    if (this.value === null || this.lastTimestampMs === null) {
      this.value = next;
      this.lastTimestampMs = timestampMs;
      return next;
    }
    const deltaMs = timestampMs - this.lastTimestampMs;
    if (deltaMs <= 0) {
      throw new RangeError("EMA timestamps must increase");
    }
    const alpha = 1 - 2 ** (-deltaMs / this.halfLifeMs);
    this.value = alpha * next + (1 - alpha) * this.value;
    this.lastTimestampMs = timestampMs;
    return this.value;
  }

  getValue(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.lastTimestampMs = null;
  }
}
