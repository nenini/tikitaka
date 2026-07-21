export interface Clock {
  monotonicNowMs(): number;
  wallClockNowMs(): number;
}

export class SystemClock implements Clock {
  monotonicNowMs(): number {
    return performance.now();
  }

  wallClockNowMs(): number {
    return Date.now();
  }
}

export function toIsoTimestamp(wallClockMs: number): string {
  if (!Number.isFinite(wallClockMs)) {
    throw new RangeError("wallClockMs must be finite");
  }

  return new Date(wallClockMs).toISOString();
}

