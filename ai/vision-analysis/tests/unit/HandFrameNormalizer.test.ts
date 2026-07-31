import { describe, expect, it } from "vitest";

import {
  computeHandBox,
  normalizeHands,
} from "../../src/vision/core/HandFrameNormalizer.js";
import type { HandLandmarkPoint } from "../../src/vision/core/HandLandmarkerFrameResult.js";

function createHandLandmarks(): HandLandmarkPoint[] {
  // MediaPipe returns 21 points. Their exact joint meaning is intentionally not
  // interpreted yet; this test verifies the hand detection transport layer.
  return Array.from({ length: 21 }, (_, index) => ({
    x: 0.2 + (index % 5) * 0.1,
    y: 0.3 + Math.floor(index / 5) * 0.1,
    z: -index * 0.001,
  }));
}

describe("HandFrameNormalizer", () => {
  it("keeps a detected hand, handedness, 21 points, and a visible box", () => {
    const hands = normalizeHands({
      inferenceDurationMs: 12,
      hands: [
        {
          landmarks: createHandLandmarks(),
          handedness: "RIGHT",
          handednessConfidence: 0.92,
        },
      ],
    });

    expect(hands).toHaveLength(1);
    expect(hands[0]?.handedness).toBe("RIGHT");
    expect(hands[0]?.handednessConfidence).toBeCloseTo(0.92);
    expect(hands[0]?.landmarks).toHaveLength(21);
    expect(hands[0]?.box.areaRatio).toBeGreaterThan(0);
    expect(hands[0]?.box.inFrameRatio).toBe(1);
  });

  it("calculates the visible ratio for a hand partly outside the frame", () => {
    const box = computeHandBox([
      { x: -0.2, y: 0.2, z: 0 },
      { x: 0.2, y: 0.8, z: 0 },
    ]);

    expect(box?.inFrameRatio).toBeCloseTo(0.5);
    expect(box?.areaRatio).toBeCloseTo(0.12);
  });

  it("drops invalid landmark sets instead of reporting a fake hand", () => {
    const hands = normalizeHands({
      inferenceDurationMs: 12,
      hands: [
        {
          landmarks: [{ x: Number.NaN, y: 0.5, z: 0 }],
          handedness: "UNKNOWN",
          handednessConfidence: 0.5,
        },
      ],
    });

    expect(hands).toEqual([]);
  });
});
