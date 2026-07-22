import { describe, expect, it } from "vitest";

import { HysteresisGate } from "../../src/vision/filters/HysteresisGate.js";

describe("HysteresisGate", () => {
  it("requires sustained entry and sustained recovery", () => {
    const gate = new HysteresisGate(1_000, 500);

    expect(gate.update(true, false, 0)).toBeNull();
    expect(gate.update(true, false, 999)).toBeNull();
    expect(gate.update(true, false, 1_000)).toEqual({
      type: "ACTIVATED",
      observedStartMs: 0,
    });
    expect(gate.update(false, true, 1_200)).toBeNull();
    expect(gate.update(false, true, 1_699)).toBeNull();
    expect(gate.update(false, true, 1_700)).toEqual({
      type: "DEACTIVATED",
      observedEndMs: 1_200,
      activeDurationMs: 1_200,
    });
  });

  it("cancels a single-frame entry candidate", () => {
    const gate = new HysteresisGate(1_000, 500);

    gate.update(true, false, 0);
    gate.update(false, true, 100);

    expect(gate.getSnapshot().state).toBe("INACTIVE");
    expect(gate.isActive()).toBe(false);
  });

  it("rejects time moving backwards", () => {
    const gate = new HysteresisGate(1_000, 500);
    gate.update(false, true, 100);

    expect(() => gate.update(false, true, 99)).toThrow(/backwards/);
  });
});

