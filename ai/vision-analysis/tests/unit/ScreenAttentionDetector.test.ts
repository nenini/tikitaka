import { describe, expect, it } from "vitest";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { ScreenAttentionDetector } from "../../src/vision/detectors/ScreenAttentionDetector.js";
import type { VisionBaseline } from "../../src/vision/calibration/VisionBaseline.js";
import { createDetectorEventFactory } from "../helpers/createDetectorTestKit.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

const baseline: VisionBaseline = { status: "READY", usableFrameCount: 20, calibratedAtSessionElapsedMs: 5_000, yaw: 0, pitch: 0, roll: 0, faceAreaRatio: 0.2, faceCenterX: 0.5, faceCenterY: 0.5, mouthSmileLeft: 0, mouthSmileRight: 0, blendshapeMeans: {}, blendshapeMedianAbsoluteDeviations: {}, expressionActivityScore: null };
const quality = { usable: true, confidence: 0.9, reasons: [] } as const;

describe("ScreenAttentionDetector", () => {
  it("ignores a brief turn and emits one start/end for a sustained turn", () => {
    const detector = new ScreenAttentionDetector({ ...defaultVisionConfig.screenAttention, emaAlpha: 1 }, createDetectorEventFactory());
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 0, yaw: 25 }), context)).toHaveLength(0);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 1_000, yaw: 0 }), context)).toHaveLength(0);
    detector.update(createNormalizedFaceFrame({ timestampMs: 2_000, yaw: 25 }), context);
    const started = detector.update(createNormalizedFaceFrame({ timestampMs: 3_500, yaw: 25 }), context);
    expect(started.map((event) => event.eventType)).toEqual(["GAZE_AWAY_STARTED"]);
    detector.update(createNormalizedFaceFrame({ timestampMs: 4_000, yaw: 0 }), context);
    const ended = detector.update(createNormalizedFaceFrame({ timestampMs: 4_500, yaw: 0 }), context);
    expect(ended.map((event) => event.eventType)).toEqual(["GAZE_AWAY_ENDED"]);
  });
});
