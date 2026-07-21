import { describe, expect, it } from "vitest";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { SmileExpressionDetector } from "../../src/vision/detectors/SmileExpressionDetector.js";
import type { VisionBaseline } from "../../src/vision/calibration/VisionBaseline.js";
import { createDetectorEventFactory } from "../helpers/createDetectorTestKit.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

const baseline: VisionBaseline = { status: "READY", usableFrameCount: 20, calibratedAtSessionElapsedMs: 5_000, yaw: 0, pitch: 0, roll: 0, faceAreaRatio: 0.2, faceCenterX: 0.5, faceCenterY: 0.5, eyeGazeHorizontalRatio: 0.5, eyeGazeVerticalRatio: 0.5, mouthSmileLeft: 0.05, mouthSmileRight: 0.05, blendshapeMeans: { mouthSmileLeft: 0.05, mouthSmileRight: 0.05, cheekSquintLeft: 0, cheekSquintRight: 0 }, blendshapeMedianAbsoluteDeviations: {}, expressionActivityScore: null };
const context = { quality: { usable: true, confidence: 0.9, reasons: [] } as const, baseline, performanceProfile: "HIGH" as const };
const smile = { mouthSmileLeft: 0.7, mouthSmileRight: 0.7, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 };

describe("SmileExpressionDetector", () => {
  it("requires duration and merges a short recovery gap", () => {
    const detector = new SmileExpressionDetector({ ...defaultVisionConfig.smile, emaAlpha: 1 }, createDetectorEventFactory());
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 0, blendshapes: smile }), context)).toHaveLength(0);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 400, blendshapes: smile }), context)[0]?.eventType).toBe("SMILE_STARTED");
    detector.update(createNormalizedFaceFrame({ timestampMs: 600, blendshapes: {} }), context);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 1_000, blendshapes: smile }), context)).toHaveLength(0);
    detector.update(createNormalizedFaceFrame({ timestampMs: 1_200, blendshapes: {} }), context);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 1_900, blendshapes: {} }), context)[0]?.eventType).toBe("SMILE_ENDED");
  });
});
