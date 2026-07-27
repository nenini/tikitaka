import type {
  BaselineSignal,
  SignalBaselineMode,
  VisionBaseline,
} from "../../src/vision/calibration/VisionBaseline.js";

const signals: readonly BaselineSignal[] = [
  "pose",
  "faceCenter",
  "faceGeometry",
  "smile",
  "gaze",
  "expressionActivity",
];

/** Creates a complete personalized baseline for detector-focused unit tests. */
export function createVisionBaseline(
  overrides: Partial<VisionBaseline> = {},
): VisionBaseline {
  const baselineModeBySignal = Object.fromEntries(
    signals.map((signal) => [signal, "PERSONALIZED"]),
  ) as Record<BaselineSignal, SignalBaselineMode>;
  const confidenceBySignal = Object.fromEntries(
    signals.map((signal) => [signal, 0.9]),
  ) as Record<BaselineSignal, number>;
  const signalStates = Object.fromEntries(
    signals.map((signal) => [
      signal,
      { mode: "PERSONALIZED", confidence: 0.9, sampleCount: 20 },
    ]),
  ) as VisionBaseline["signalStates"];
  return {
    schemaVersion: 2,
    status: "READY",
    baselineEpoch: 0,
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
    leftEyeHorizontalBaseline: 0.5,
    rightEyeHorizontalBaseline: 0.5,
    leftEyeVerticalBaseline: 0.5,
    rightEyeVerticalBaseline: 0.5,
    leftEyeBaselineConfidence: 0.9,
    rightEyeBaselineConfidence: 0.9,
    mouthSmileLeft: 0,
    mouthSmileRight: 0,
    baselineSmileScore: 0,
    blendshapeMeans: {},
    blendshapeMedianAbsoluteDeviations: {},
    expressionActivityScore: null,
    baselineModeBySignal,
    confidenceBySignal,
    signalStates,
    ...overrides,
  };
}
