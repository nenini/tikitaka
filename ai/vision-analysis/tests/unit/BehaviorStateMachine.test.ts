import { describe, expect, it } from "vitest";

import { BehaviorEpisodeClock } from "../../src/vision/detectors/BehaviorStateMachine.js";

describe("BehaviorEpisodeClock", () => {
  it("separates observed time from a short suspension in the same episode", () => {
    const clock = new BehaviorEpisodeClock();
    clock.start(1_000, 1_400);
    expect(clock.observe(1_600, 500)).toBe(true);

    clock.suspend(1_600);
    expect(clock.suspensionDurationMs(2_400)).toBe(800);
    clock.resume(2_400);
    expect(clock.observe(2_600, 500)).toBe(true);

    expect(clock.durations(2_600)).toEqual({
      wallDurationMs: 1_600,
      observedDurationMs: 800,
      unobservedDurationMs: 800,
    });
  });

  it("marks a long frame gap as unobserved instead of behavior duration", () => {
    const clock = new BehaviorEpisodeClock();
    clock.start(0, 400);

    expect(clock.observe(1_200, 500)).toBe(false);
    expect(clock.suspensionStartedAt()).toBe(400);
    expect(clock.durations(1_200)).toEqual({
      wallDurationMs: 1_200,
      observedDurationMs: 400,
      unobservedDurationMs: 800,
    });
  });
});
