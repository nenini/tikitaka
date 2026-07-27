import { describe, expect, it } from "vitest";

import { AdaptiveBaselineManager } from "../../src/vision/calibration/AdaptiveBaselineManager.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";
import { createVisionBaseline } from "../helpers/createVisionBaseline.js";

const quality = { usable: true, confidence: 0.9, reasons: [] } as const;
const unfrozen = { gaze: false, nod: false, smile: false } as const;

describe("AdaptiveBaselineManager", () => {
  it("adapts pose slowly while keeping smile baseline fixed", () => {
    const manager = new AdaptiveBaselineManager(
      defaultVisionConfig.adaptiveBaseline,
    );
    const initial = createVisionBaseline({
      baselineSmileScore: 0.25,
      mouthSmileLeft: 0.25,
      mouthSmileRight: 0.25,
    });
    let baseline = initial;
    for (let timestampMs = 0; timestampMs <= 15_000; timestampMs += 1_000) {
      baseline = manager.update(
        initial,
        createNormalizedFaceFrame({ timestampMs, yaw: 6 }),
        quality,
        unfrozen,
      );
    }
    expect(baseline.yaw).toBeGreaterThan(0);
    expect(baseline.yaw).toBeLessThan(1);
    expect(baseline.baselineSmileScore).toBe(0.25);
    expect(baseline.mouthSmileLeft).toBe(0.25);
  });

  it("freezes gaze-related adaptation during an active departure", () => {
    const manager = new AdaptiveBaselineManager(
      defaultVisionConfig.adaptiveBaseline,
    );
    const initial = createVisionBaseline();
    let baseline = initial;
    for (let timestampMs = 0; timestampMs <= 15_000; timestampMs += 1_000) {
      baseline = manager.update(
        initial,
        createNormalizedFaceFrame({
          timestampMs,
          yaw: 6,
          centerX: 0.56,
        }),
        quality,
        { gaze: true, nod: false, smile: false },
      );
    }
    expect(baseline.yaw).toBe(initial.yaw);
    expect(baseline.faceCenterX).toBe(initial.faceCenterX);
  });

  it("promotes a stable geometry shift to a new epoch and can roll back", () => {
    const manager = new AdaptiveBaselineManager({
      ...defaultVisionConfig.adaptiveBaseline,
      reanchorMinimumStableMs: 5_000,
      reanchorMinimumSamples: 6,
    });
    const initial = createVisionBaseline();
    let baseline = initial;
    for (let timestampMs = 0; timestampMs <= 20_000; timestampMs += 1_000) {
      baseline = manager.update(
        initial,
        createNormalizedFaceFrame({
          timestampMs,
          centerX: 0.56,
          faceAreaRatio: 0.27,
        }),
        quality,
        unfrozen,
      );
    }
    expect(baseline.baselineEpoch).toBeGreaterThan(0);
    const promotedEpoch = baseline.baselineEpoch;
    const rolledBack = manager.rollbackEpoch();
    expect(rolledBack?.baselineEpoch).toBe(promotedEpoch - 1);
  });
});
