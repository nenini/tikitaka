import type { Clock } from "./Clock.js";

export interface SessionClockAnchor {
  readonly sessionElapsedMsAtSync: number;
  readonly clientMonotonicMsAtSync: number;
}

export interface SessionTimePoint {
  readonly sessionElapsedMs: number;
  readonly clientMonotonicMs: number;
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

export class SessionTimeline {
  private readonly anchor: SessionClockAnchor;

  constructor(
    anchor: SessionClockAnchor,
    private readonly clock: Clock,
  ) {
    assertNonNegativeFinite(
      anchor.sessionElapsedMsAtSync,
      "sessionElapsedMsAtSync",
    );
    assertNonNegativeFinite(
      anchor.clientMonotonicMsAtSync,
      "clientMonotonicMsAtSync",
    );
    this.anchor = Object.freeze({ ...anchor });
  }

  now(): SessionTimePoint {
    return this.at(this.clock.monotonicNowMs());
  }

  at(clientMonotonicMs: number): SessionTimePoint {
    assertNonNegativeFinite(clientMonotonicMs, "clientMonotonicMs");

    if (clientMonotonicMs < this.anchor.clientMonotonicMsAtSync) {
      throw new RangeError("clientMonotonicMs cannot precede the session anchor");
    }

    return {
      clientMonotonicMs,
      sessionElapsedMs:
        this.anchor.sessionElapsedMsAtSync +
        (clientMonotonicMs - this.anchor.clientMonotonicMsAtSync),
    };
  }

  getAnchor(): SessionClockAnchor {
    return this.anchor;
  }
}

