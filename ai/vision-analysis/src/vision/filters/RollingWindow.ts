export interface TimedValue {
  readonly timestampMs: number;
  readonly value: number;
}

/** Time-bounded numeric buffer; old samples are removed on every insertion. */
export class RollingWindow {
  private readonly values: TimedValue[] = [];

  constructor(
    private readonly durationMs: number,
    private readonly maximumEntries = 600,
  ) {
    if (durationMs <= 0 || maximumEntries <= 0) throw new RangeError("window limits must be positive");
  }

  add(timestampMs: number, value: number): void {
    if (!Number.isFinite(timestampMs) || !Number.isFinite(value)) throw new RangeError("sample must be finite");
    this.values.push({ timestampMs, value });
    const cutoff = timestampMs - this.durationMs;
    while ((this.values[0]?.timestampMs ?? timestampMs) < cutoff) this.values.shift();
    while (this.values.length > this.maximumEntries) this.values.shift();
  }

  snapshot(): readonly TimedValue[] {
    return this.values.map((sample) => ({ ...sample }));
  }

  mean(): number | null {
    if (this.values.length === 0) return null;
    return this.values.reduce((sum, sample) => sum + sample.value, 0) / this.values.length;
  }

  reset(): void {
    this.values.length = 0;
  }
}
