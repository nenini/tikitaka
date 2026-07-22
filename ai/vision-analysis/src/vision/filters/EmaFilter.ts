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
