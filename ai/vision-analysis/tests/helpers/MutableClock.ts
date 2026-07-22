import type { Clock } from "../../src/common/Clock.js";

export class MutableClock implements Clock {
  constructor(
    private monotonicMs = 0,
    private wallMs = Date.parse("2026-07-20T00:00:00.000Z"),
  ) {}

  monotonicNowMs(): number {
    return this.monotonicMs;
  }

  wallClockNowMs(): number {
    return this.wallMs;
  }

  set(monotonicMs: number): void {
    const delta = monotonicMs - this.monotonicMs;
    this.monotonicMs = monotonicMs;
    this.wallMs += delta;
  }
}

