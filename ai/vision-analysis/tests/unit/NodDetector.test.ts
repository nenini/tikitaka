import { describe, expect, it } from "vitest";

import type { VisionBaseline } from "../../src/vision/calibration/VisionBaseline.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { NodDetector } from "../../src/vision/detectors/NodDetector.js";
import { createDetectorEventFactory } from "../helpers/createDetectorTestKit.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

const baseline: VisionBaseline = {
  status: "READY",
  usableFrameCount: 20,
  calibratedAtSessionElapsedMs: 5_000,
  yaw: 0,
  pitch: 0,
  roll: 0,
  faceAreaRatio: 0.2,
  faceCenterX: 0.5,
  faceCenterY: 0.5,
  mouthSmileLeft: 0,
  mouthSmileRight: 0,
  blendshapeMeans: {},
  blendshapeMedianAbsoluteDeviations: {},
  expressionActivityScore: null,
};
const context = {
  quality: { usable: true, confidence: 0.9, reasons: [] } as const,
  baseline,
  performanceProfile: "HIGH" as const,
};
const nodConfig = { ...defaultVisionConfig.nod, emaAlpha: 1 };

describe("NodDetector", () => {
  it("emits once for a complete down-reversal-return cycle", () => {
    const detector = new NodDetector(nodConfig, createDetectorEventFactory());
    const samples = [
      [0, 0],
      [200, 8],
      [350, 10],
      [450, 7],
      [600, 0],
    ] as const;

    const events = samples.flatMap(([timestampMs, pitch]) =>
      detector.update(
        createNormalizedFaceFrame({ timestampMs, pitch }),
        context,
      ),
    );

    expect(events.map((event) => event.eventType)).toEqual(["NOD_EVENT"]);
    expect(events[0]?.payload).toMatchObject({
      amplitudeDegrees: 10,
      durationMs: 600,
      downstrokeMs: 350,
      upstrokeMs: 150,
    });
    expect(detector.getState().state).toBe("COOLDOWN");
  });

  it("rejects a long downward hold", () => {
    const detector = new NodDetector(nodConfig, createDetectorEventFactory());
    const samples = [
      [0, 0],
      [200, 8],
      [350, 10],
      [900, 10],
      [1_000, 0],
    ] as const;

    const events = samples.flatMap(([timestampMs, pitch]) =>
      detector.update(
        createNormalizedFaceFrame({ timestampMs, pitch }),
        context,
      ),
    );

    expect(events).toHaveLength(0);
  });
});
