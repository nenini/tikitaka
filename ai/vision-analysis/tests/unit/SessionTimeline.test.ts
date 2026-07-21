import { describe, expect, it } from "vitest";

import type { Clock } from "../../src/common/Clock.js";
import { SessionTimeline } from "../../src/common/SessionTimeline.js";

class FakeClock implements Clock {
  constructor(
    private monotonicMs: number,
    private wallMs: number,
  ) {}

  monotonicNowMs(): number {
    return this.monotonicMs;
  }

  wallClockNowMs(): number {
    return this.wallMs;
  }
}

describe("SessionTimeline", () => {
  it("keeps session elapsed time continuous from a server-provided anchor", () => {
    const clock = new FakeClock(350, 1_700_000_000_000);
    const timeline = new SessionTimeline(
      {
        sessionElapsedMsAtSync: 4_000,
        clientMonotonicMsAtSync: 100,
      },
      clock,
    );

    expect(timeline.now()).toEqual({
      sessionElapsedMs: 4_250,
      clientMonotonicMs: 350,
    });
  });

  it("rejects timestamps that precede the synchronization anchor", () => {
    const clock = new FakeClock(50, 1_700_000_000_000);
    const timeline = new SessionTimeline(
      {
        sessionElapsedMsAtSync: 4_000,
        clientMonotonicMsAtSync: 100,
      },
      clock,
    );

    expect(() => timeline.now()).toThrow(/cannot precede/);
  });

  it("rejects invalid anchors", () => {
    const clock = new FakeClock(100, 1_700_000_000_000);

    expect(
      () =>
        new SessionTimeline(
          {
            sessionElapsedMsAtSync: -1,
            clientMonotonicMsAtSync: 100,
          },
          clock,
        ),
    ).toThrow(/non-negative/);
  });
});

