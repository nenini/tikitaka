import { describe, expect, it } from "vitest";

import {
  HandOverMouthDetector,
  calculateHandOverMouthOverlap,
} from "../../src/vision/detectors/HandOverMouthDetector.js";
import { computeMouthRegion } from "../../src/vision/core/FaceFrameNormalizer.js";
import type { NormalizedHand } from "../../src/vision/core/NormalizedHand.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

function createHand(
  centerX: number,
  centerY: number,
  confidence = 0.95,
): NormalizedHand {
  // A compact synthetic palm is sufficient to exercise the overlap rule; the
  // production adapter still provides the full 21 MediaPipe landmarks.
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: centerX + ((index % 4) - 1.5) * 0.018,
    y: centerY + (Math.floor(index / 4) - 2) * 0.014,
    z: 0,
  }));
  const palmOffsets: Readonly<Record<number, readonly [number, number]>> = {
    0: [-0.02, 0.08],
    1: [-0.07, 0.03],
    5: [-0.07, -0.06],
    9: [-0.02, -0.08],
    13: [0.05, -0.06],
    17: [0.08, 0.03],
  };
  for (const [rawIndex, offset] of Object.entries(palmOffsets)) {
    const index = Number(rawIndex);
    landmarks[index] = {
      x: centerX + offset[0],
      y: centerY + offset[1],
      z: 0,
    };
  }
  return {
    handedness: "RIGHT",
    handednessConfidence: confidence,
    box: {
      left: centerX - 0.1,
      top: centerY - 0.1,
      right: centerX + 0.1,
      bottom: centerY + 0.1,
      centerX,
      centerY,
      areaRatio: 0.04,
      inFrameRatio: 1,
    },
    landmarks,
  };
}

function frameWithHand(timestampMs: number, hand: NormalizedHand) {
  return {
    ...createNormalizedFaceFrame({ timestampMs }),
    handDetected: true,
    handCount: 1,
    hands: [hand],
  };
}

describe("HandOverMouthDetector", () => {
  it("derives a padded mouth region without retaining raw face landmarks", () => {
    const landmarks = Array.from({ length: 478 }, (_, index) => ({
      x: index % 2 === 0 ? 0.45 : 0.55,
      y: index % 3 === 0 ? 0.58 : 0.62,
      z: 0,
    }));

    const region = computeMouthRegion(landmarks);

    expect(region).not.toBeNull();
    expect(region?.left).toBeLessThan(0.45);
    expect(region?.right).toBeGreaterThan(0.55);
    expect(region?.top).toBeLessThan(0.58);
    expect(region?.bottom).toBeGreaterThan(0.62);
  });

  it("reports high coverage for a confident hand over the mouth", () => {
    const result = calculateHandOverMouthOverlap(
      { left: 0.42, top: 0.58, right: 0.58, bottom: 0.68 },
      [createHand(0.5, 0.63)],
    );

    expect(result.overlapRatio).toBeGreaterThan(0.5);
    expect(result.matchedHand?.handedness).toBe("RIGHT");
  });

  it("ignores a low-confidence hand and a confident hand away from the mouth", () => {
    const mouth = { left: 0.42, top: 0.58, right: 0.58, bottom: 0.68 };

    expect(
      calculateHandOverMouthOverlap(
        mouth,
        [createHand(0.5, 0.63, 0.5)],
      ).overlapRatio,
    ).toBe(0);
    expect(
      calculateHandOverMouthOverlap(
        mouth,
        [createHand(0.15, 0.2)],
      ).overlapRatio,
    ).toBe(0);
  });

  it("activates and recovers only after the configured hysteresis durations", () => {
    const detector = new HandOverMouthDetector({
      entryOverlapRatio: 0.45,
      recoveryOverlapRatio: 0.35,
      entryDurationMs: 400,
      recoveryDurationMs: 400,
      minimumHandednessConfidence: 0.7,
    });
    const coveringHand = createHand(0.5, 0.63);
    const clearHand = createHand(0.15, 0.2);

    expect(detector.update(frameWithHand(0, coveringHand)).gateState).toBe(
      "ENTRY_CANDIDATE",
    );
    expect(detector.update(frameWithHand(399, coveringHand)).active).toBe(
      false,
    );
    const activated = detector.update(frameWithHand(400, coveringHand));
    expect(activated.active).toBe(true);
    expect(activated.transition?.type).toBe("ACTIVATED");

    expect(detector.update(frameWithHand(600, clearHand)).gateState).toBe(
      "RECOVERY_CANDIDATE",
    );
    expect(detector.update(frameWithHand(999, clearHand)).active).toBe(true);
    const recovered = detector.update(frameWithHand(1_000, clearHand));
    expect(recovered.active).toBe(false);
    expect(recovered.transition?.type).toBe("DEACTIVATED");
  });
});
