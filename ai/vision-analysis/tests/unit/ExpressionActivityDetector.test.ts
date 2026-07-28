import { describe, expect, it } from "vitest";

import { createVisionBaseline } from "../helpers/createVisionBaseline.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { ExpressionActivityDetector } from "../../src/vision/detectors/ExpressionActivityDetector.js";
import { computeExpressionActivityScores } from "../../src/vision/detectors/ExpressionActivityScore.js";
import { createDetectorEventFactory } from "../helpers/createDetectorTestKit.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

const baseline = createVisionBaseline({
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
});
const usableContext = {
  quality: { usable: true, confidence: 0.9, reasons: [] } as const,
  baseline,
  performanceProfile: "HIGH" as const,
};

const activityConfig = {
  ...defaultVisionConfig.expressionActivity,
  upperFaceBlendshapeNames: ["browInnerUp"],
  lowerFaceBlendshapeNames: ["mouthSmileLeft"],
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
  it("normalizes total variation by observable seconds across frame rates", () => {
    const previous = createNormalizedFaceFrame({
      timestampMs: 0,
      blendshapes: { browInnerUp: 0, mouthSmileLeft: 0 },
    }).primaryFace;
    const atFiveFps = createNormalizedFaceFrame({
      timestampMs: 200,
      blendshapes: { browInnerUp: 0.2, mouthSmileLeft: 0.2 },
    }).primaryFace;
    const atLowFps = createNormalizedFaceFrame({
      timestampMs: 400,
      blendshapes: { browInnerUp: 0.4, mouthSmileLeft: 0.4 },
    }).primaryFace;
    if (previous === null || atFiveFps === null || atLowFps === null) {
      throw new Error("test faces must be present");
    }

    const fiveFps = computeExpressionActivityScores(
      previous,
      atFiveFps,
      200,
      1,
      activityConfig,
    );
    const lowFps = computeExpressionActivityScores(
      previous,
      atLowFps,
      400,
      1,
      activityConfig,
    );
    expect(fiveFps.expressionActivityScore).toBeCloseTo(
      lowFps.expressionActivityScore ?? -1,
    );
  });

  it("keeps activity as an experimental metric without behavior events", () => {
    const detector = new ExpressionActivityDetector(
      activityConfig,
      createDetectorEventFactory(),
    );

    for (const timestampMs of [0, 200, 400, 600, 800]) {
      expect(
        detector.update(
          createNormalizedFaceFrame({
            timestampMs,
            blendshapes: { browInnerUp: 0, mouthSmileLeft: 0 },
          }),
          usableContext,
        ),
      ).toHaveLength(0);
    }
    const events = detector.update(
      createNormalizedFaceFrame({
        timestampMs: 1_000,
        blendshapes: { browInnerUp: 0.2, mouthSmileLeft: 0.2 },
      }),
      usableContext,
    );
    expect(events).toHaveLength(0);
    expect(detector.getState()).toMatchObject({
      state: "NORMAL",
      activityConfidence: expect.any(Number),
    });
    expect(detector.getState().lowerFaceActivityScore).not.toBeNull();
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
    expect(detector.getState().state).toBe("SUSPENDED");
    expect(detector.getState().sampleCount).toBe(0);
  });
});
