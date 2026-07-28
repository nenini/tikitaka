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
    for (let timestampMs = 0; timestampMs <= 6_200; timestampMs += 200) {
      calibrator.update(createNormalizedFaceFrame({
        timestampMs,
        yaw: 3,
        pitch: -2,
        blendshapes: {
          mouthSmileLeft: 0.1,
          mouthSmileRight: 0.12,
          eyeBlinkLeft: 0,
          eyeBlinkRight: 0,
        },
      }), usable);
    }
    const state = calibrator.getState(6_200);
    expect(state.status).toBe("READY");
    expect(state.baseline.yaw).toBe(3);
    expect(state.baseline.mouthSmileLeft).toBeCloseTo(0.1);
    expect(state.baseline.eyeGazeHorizontalRatio).toBeCloseTo(0.5);
    expect(state.baseline.eyeGazeVerticalRatio).toBeCloseTo(0.5);
  });

  it("does not auto-fail setup and supports explicit global fallback", () => {
    const calibrator = new BaselineCalibrator(
      defaultVisionConfig.calibration,
      defaultVisionConfig.expressionActivity,
      defaultVisionConfig.screenAttention,
    );
    calibrator.update(createNormalizedFaceFrame({ timestampMs: 0 }), { usable: false, confidence: 0.9, reasons: ["LOW_LIGHT"] });
    const waiting = calibrator.update(createNormalizedFaceFrame({ timestampMs: 20_000 }), { usable: false, confidence: 0.9, reasons: ["LOW_LIGHT"] });
    expect(waiting.status).toBe("PRECHECK");
    const state = calibrator.useGlobalFallback(20_000);
    expect(state.status).toBe("GLOBAL_FALLBACK");
    expect(state.excludedFrameCount).toBe(2);
  });

  it("continues usable-only activity calibration after pose baseline is ready", () => {
    const calibrator = new BaselineCalibrator(
      defaultVisionConfig.calibration,
      {
        ...defaultVisionConfig.expressionActivity,
        upperFaceBlendshapeNames: ["browInnerUp"],
        lowerFaceBlendshapeNames: ["mouthSmileLeft"],
        blendshapeWeight: 1,
        landmarkWeight: 0,
      },
      defaultVisionConfig.screenAttention,
    );

    for (let timestampMs = 0; timestampMs <= 22_000; timestampMs += 200) {
      calibrator.update(
        createNormalizedFaceFrame({
          timestampMs,
          blendshapes: {
            browInnerUp: timestampMs % 400 === 0 ? 0 : 0.2,
            mouthSmileLeft: timestampMs % 400 === 0 ? 0 : 0.2,
          },
        }),
        usable,
      );
    }

    const baseline = calibrator.getBaseline();
    expect(baseline.status).toBe("READY");
    expect(baseline.expressionActivityScore).not.toBeNull();
    expect(baseline.expressionActivityScore).toBeCloseTo(0.5);
  });

  it("pauses on quality failure and resumes without discarding samples", () => {
    const calibrator = new BaselineCalibrator(
      defaultVisionConfig.calibration,
      defaultVisionConfig.expressionActivity,
      defaultVisionConfig.screenAttention,
    );
    for (const timestampMs of [0, 500, 1_000, 1_500, 2_000]) {
      calibrator.update(createNormalizedFaceFrame({ timestampMs }), usable);
    }
    const beforePause = calibrator.getState(2_000);
    const paused = calibrator.update(
      createNormalizedFaceFrame({ timestampMs: 2_500 }),
      { usable: false, confidence: 0.3, reasons: ["LOW_LIGHT"] },
    );
    expect(paused.status).toBe("PAUSED");
    expect(paused.usableFrameCount).toBe(beforePause.usableFrameCount);
    expect(paused.calibrationUsableTimeMs).toBe(
      beforePause.calibrationUsableTimeMs,
    );

    calibrator.update(createNormalizedFaceFrame({ timestampMs: 3_000 }), usable);
    expect(calibrator.getState(3_000).status).toBe("STABILIZING");
    calibrator.update(createNormalizedFaceFrame({ timestampMs: 3_500 }), usable);
    calibrator.update(createNormalizedFaceFrame({ timestampMs: 4_000 }), usable);
    expect(calibrator.getState(4_000).status).toBe("COLLECTING");
    expect(calibrator.getState(4_000).usableFrameCount).toBeGreaterThan(
      beforePause.usableFrameCount,
    );
  });

  it("keeps one-eye failure local and can finish as partial", () => {
    const calibrator = new BaselineCalibrator(
      defaultVisionConfig.calibration,
      defaultVisionConfig.expressionActivity,
      defaultVisionConfig.screenAttention,
    );
    for (let timestampMs = 0; timestampMs <= 4_500; timestampMs += 500) {
      calibrator.update(
        createNormalizedFaceFrame({
          timestampMs,
          blendshapes: {
            mouthSmileLeft: 0.1,
            mouthSmileRight: 0.1,
            eyeBlinkLeft: 0.9,
            eyeBlinkRight: 0,
          },
        }),
        usable,
      );
    }
    const partial = calibrator.update(
      createNormalizedFaceFrame({
        timestampMs: 13_000,
        blendshapes: {
          mouthSmileLeft: 0.1,
          mouthSmileRight: 0.1,
          eyeBlinkLeft: 0.9,
          eyeBlinkRight: 0,
        },
      }),
      usable,
    );
    expect(partial.status).toBe("PARTIAL");
    expect(partial.baseline.baselineModeBySignal.pose).toBe("PERSONALIZED");
    expect(partial.baseline.baselineModeBySignal.gaze).toBe(
      "MONOCULAR_RIGHT",
    );
  });
});
