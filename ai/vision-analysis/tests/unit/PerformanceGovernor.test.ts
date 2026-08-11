import { describe, expect, it } from "vitest";

import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { PerformanceGovernor } from "../../src/vision/core/PerformanceGovernor.js";

function createGovernor(): PerformanceGovernor {
  return new PerformanceGovernor({
    profiles: defaultVisionConfig.profiles,
    performanceGovernor: {
      ...defaultVisionConfig.performanceGovernor,
      overloadWindowMs: 1_000,
      recoveryWindowMs: 2_000,
      profileChangeCooldownMs: 500,
    },
  });
}

describe("PerformanceGovernor", () => {
  it("degrades one level per overload window and recovers more slowly", () => {
    const governor = createGovernor();

    expect(
      governor.update({ clientMonotonicMs: 0, processingDurationMs: 200 })
        .profile,
    ).toBe("HIGH");
    governor.update({ clientMonotonicMs: 500, processingDurationMs: 200 });
    const medium = governor.update({
      clientMonotonicMs: 1_000,
      processingDurationMs: 200,
    });

    expect(medium).toMatchObject({
      previousProfile: "HIGH",
      profile: "MEDIUM",
      targetFps: 3,
      changed: true,
    });

    governor.update({ clientMonotonicMs: 1_500, processingDurationMs: 333 });
    governor.update({ clientMonotonicMs: 2_000, processingDurationMs: 333 });
    expect(
      governor.update({ clientMonotonicMs: 2_500, processingDurationMs: 333 }),
    ).toMatchObject({ profile: "LOW", changed: true });

    governor.update({ clientMonotonicMs: 3_000, processingDurationMs: 0 });
    governor.update({ clientMonotonicMs: 4_000, processingDurationMs: 0 });
    expect(
      governor.update({ clientMonotonicMs: 5_000, processingDurationMs: 0 }),
    ).toMatchObject({ profile: "MEDIUM", changed: true });

    governor.update({ clientMonotonicMs: 5_500, processingDurationMs: 0 });
    governor.update({ clientMonotonicMs: 6_500, processingDurationMs: 0 });
    expect(
      governor.update({ clientMonotonicMs: 7_500, processingDurationMs: 0 }),
    ).toMatchObject({ profile: "HIGH", changed: true });
  });

  it("does not react to a transient spike before the configured window", () => {
    const governor = createGovernor();

    governor.update({ clientMonotonicMs: 0, processingDurationMs: 500 });
    const decision = governor.update({
      clientMonotonicMs: 999,
      processingDurationMs: 500,
    });

    expect(decision.profile).toBe("HIGH");
    expect(decision.changed).toBe(false);
  });

  it("covers the overload window when frame times do not hit its boundary", () => {
    const governor = createGovernor();

    governor.update({ clientMonotonicMs: 0, processingDurationMs: 200 });
    governor.update({ clientMonotonicMs: 333, processingDurationMs: 200 });
    governor.update({ clientMonotonicMs: 666, processingDurationMs: 200 });
    expect(
      governor.update({ clientMonotonicMs: 1_001, processingDurationMs: 200 }),
    ).toMatchObject({ profile: "MEDIUM", changed: true });
  });

  it("rejects time moving backwards so windows cannot be corrupted", () => {
    const governor = createGovernor();
    governor.update({ clientMonotonicMs: 100, processingDurationMs: 10 });

    expect(() =>
      governor.update({ clientMonotonicMs: 99, processingDurationMs: 10 }),
    ).toThrow(/monotonic/);
  });
});
