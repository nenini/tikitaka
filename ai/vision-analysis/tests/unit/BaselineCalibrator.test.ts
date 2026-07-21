import { describe, expect, it } from "vitest";
import { BaselineCalibrator } from "../../src/vision/calibration/BaselineCalibrator.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

const usable = { usable: true, confidence: 0.9, reasons: [] } as const;

describe("BaselineCalibrator", () => {
  it("uses only usable frames and becomes ready after duration and frame gates", () => {
    const calibrator = new BaselineCalibrator(defaultVisionConfig.calibration);
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
  });

  it("falls back when wall time expires without enough usable data", () => {
    const calibrator = new BaselineCalibrator(defaultVisionConfig.calibration);
    calibrator.update(createNormalizedFaceFrame({ timestampMs: 0 }), { usable: false, confidence: 0.9, reasons: ["LOW_LIGHT"] });
    const state = calibrator.update(createNormalizedFaceFrame({ timestampMs: 10_000 }), { usable: false, confidence: 0.9, reasons: ["LOW_LIGHT"] });
    expect(state.status).toBe("FALLBACK");
    expect(state.excludedFrameCount).toBe(2);
  });
});
