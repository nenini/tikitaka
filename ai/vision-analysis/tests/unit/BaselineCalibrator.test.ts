import { describe, expect, it } from "vitest";
import { BaselineCalibrator } from "../../src/vision/calibration/BaselineCalibrator.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

const usable = { usable: true, confidence: 0.9, reasons: [] } as const;

describe("BaselineCalibrator", () => {
  it("uses only usable frames and becomes ready after duration and frame gates", () => {
    const calibrator = new BaselineCalibrator(
      defaultVisionConfig.calibration,
      defaultVisionConfig.expressionActivity,
      defaultVisionConfig.screenAttention,
    );
    for (let timestampMs = 0; timestampMs <= 5_000; timestampMs += 200) {
      calibrator.update(createNormalizedFaceFrame({
        timestampMs,
        yaw: 3,
        pitch: -2,
        blendshapes: { mouthSmileLeft: 0.1, mouthSmileRight: 0.12 },
      }), usable);
    }
    const state = calibrator.getState(5_000);
    expect(state.status).toBe("READY");
    expect(state.baseline.yaw).toBe(3);
    expect(state.baseline.mouthSmileLeft).toBeCloseTo(0.1);
    expect(state.baseline.eyeGazeHorizontalRatio).toBeCloseTo(0.5);
    expect(state.baseline.eyeGazeVerticalRatio).toBeCloseTo(0.5);
  });

  it("falls back when wall time expires without enough usable data", () => {
    const calibrator = new BaselineCalibrator(
      defaultVisionConfig.calibration,
      defaultVisionConfig.expressionActivity,
      defaultVisionConfig.screenAttention,
    );
    calibrator.update(createNormalizedFaceFrame({ timestampMs: 0 }), { usable: false, confidence: 0.9, reasons: ["LOW_LIGHT"] });
    const state = calibrator.update(createNormalizedFaceFrame({ timestampMs: 10_000 }), { usable: false, confidence: 0.9, reasons: ["LOW_LIGHT"] });
    expect(state.status).toBe("FALLBACK");
    expect(state.excludedFrameCount).toBe(2);
  });

  it("continues usable-only activity calibration after pose baseline is ready", () => {
    const calibrator = new BaselineCalibrator(
      defaultVisionConfig.calibration,
      {
        ...defaultVisionConfig.expressionActivity,
        blendshapeNames: ["jawOpen"],
        blendshapeWeight: 1,
        landmarkWeight: 0,
      },
      defaultVisionConfig.screenAttention,
    );

    for (let timestampMs = 0; timestampMs <= 20_000; timestampMs += 200) {
      calibrator.update(
        createNormalizedFaceFrame({
          timestampMs,
          blendshapes: { jawOpen: timestampMs % 400 === 0 ? 0 : 0.2 },
        }),
        usable,
      );
    }

    const baseline = calibrator.getBaseline();
    expect(baseline.status).toBe("READY");
    expect(baseline.expressionActivityScore).not.toBeNull();
    expect(baseline.expressionActivityScore).toBeCloseTo(0.2);
  });
});
