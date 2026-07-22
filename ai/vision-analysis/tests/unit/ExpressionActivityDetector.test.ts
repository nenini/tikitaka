import { describe, expect, it } from "vitest";

import type { VisionBaseline } from "../../src/vision/calibration/VisionBaseline.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { ExpressionActivityDetector } from "../../src/vision/detectors/ExpressionActivityDetector.js";
import { visionBehaviorEventSchema } from "../../src/vision/events/VisionEventSchema.js";
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
  eyeGazeHorizontalRatio: 0.5,
  eyeGazeVerticalRatio: 0.5,
  mouthSmileLeft: 0,
  mouthSmileRight: 0,
  blendshapeMeans: {},
  blendshapeMedianAbsoluteDeviations: {},
  expressionActivityScore: null,
};
const usableContext = {
  quality: { usable: true, confidence: 0.9, reasons: [] } as const,
  baseline,
  performanceProfile: "HIGH" as const,
};

const activityConfig = {
  ...defaultVisionConfig.expressionActivity,
  blendshapeNames: ["jawOpen"],
  blendshapeWeight: 0.7,
  landmarkWeight: 0.3,
  windowMs: 400,
  warmupMs: 400,
  minimumWindowSamples: 3,
  lowMinimumDurationMs: 400,
  recoveryMinimumDurationMs: 200,
  fallbackLowThreshold: 0.1,
  fallbackRecoveryThreshold: 0.2,
  emaAlpha: 1,
};

describe("ExpressionActivityDetector", () => {
  it("emits one low-activity episode after warmup and hysteresis", () => {
    const detector = new ExpressionActivityDetector(
      activityConfig,
      createDetectorEventFactory(),
    );

    for (const timestampMs of [0, 200, 400, 600, 800]) {
      expect(
        detector.update(createNormalizedFaceFrame({ timestampMs }), usableContext),
      ).toHaveLength(0);
    }
    const started = detector.update(
      createNormalizedFaceFrame({ timestampMs: 1_000 }),
      usableContext,
    );
    expect(started.map((event) => event.eventType)).toEqual([
      "STIFF_EXPRESSION_STARTED",
    ]);
    expect(visionBehaviorEventSchema.parse(started[0])).toEqual(started[0]);

    detector.update(
      createNormalizedFaceFrame({
        timestampMs: 1_200,
        blendshapes: { jawOpen: 1 },
        landmarkDisplacementScore: 1,
      }),
      usableContext,
    );
    const ended = detector.update(
      createNormalizedFaceFrame({
        timestampMs: 1_400,
        blendshapes: { jawOpen: 0 },
        landmarkDisplacementScore: 1,
      }),
      usableContext,
    );
    expect(ended.map((event) => event.eventType)).toEqual([
      "STIFF_EXPRESSION_ENDED",
    ]);
    expect(visionBehaviorEventSchema.parse(ended[0])).toEqual(ended[0]);
  });

  it("clears candidate samples across an unusable gap", () => {
    const detector = new ExpressionActivityDetector(
      activityConfig,
      createDetectorEventFactory(),
    );
    for (const timestampMs of [0, 200, 400, 600]) {
      detector.update(createNormalizedFaceFrame({ timestampMs }), usableContext);
    }

    const events = detector.update(createNormalizedFaceFrame({ timestampMs: 800 }), {
      ...usableContext,
      quality: { usable: false, confidence: 0.9, reasons: ["LOW_LIGHT"] },
    });

    expect(events).toHaveLength(0);
    expect(detector.getState().state).toBe("WAITING_FOR_BASELINE");
    expect(detector.getState().sampleCount).toBe(0);
  });
});
