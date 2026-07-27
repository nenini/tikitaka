import { describe, expect, it } from "vitest";

import {
  computeFaceBox,
  computeNormalizedEyeGaze,
  FaceFrameNormalizer,
  selectPrimaryFaceBox,
} from "../../src/vision/core/FaceFrameNormalizer.js";
import type {
  FaceLandmarkPoint,
  LandmarkerFaceResult,
  LandmarkerFrameResult,
} from "../../src/vision/core/LandmarkerFrameResult.js";

function createLandmarks(offsetX = 0): FaceLandmarkPoint[] {
  const landmarks = Array.from({ length: 478 }, () => ({
    x: 0.5 + offsetX,
    y: 0.5,
    z: 0,
  }));
  landmarks[0] = { x: 0.3 + offsetX, y: 0.2, z: 0 };
  landmarks[2] = { x: 0.7 + offsetX, y: 0.8, z: 0 };
  landmarks[1] = { x: 0.5 + offsetX, y: 0.4, z: 0 };
  landmarks[13] = { x: 0.5 + offsetX, y: 0.5, z: 0 };
  landmarks[61] = { x: 0.4 + offsetX, y: 0.55, z: 0 };
  landmarks[152] = { x: 0.5 + offsetX, y: 0.7, z: 0 };
  landmarks[291] = { x: 0.6 + offsetX, y: 0.55, z: 0 };
  landmarks[33] = { x: 0.35 + offsetX, y: 0.4, z: 0 };
  landmarks[133] = { x: 0.45 + offsetX, y: 0.4, z: 0 };
  landmarks[159] = { x: 0.4 + offsetX, y: 0.38, z: 0 };
  landmarks[145] = { x: 0.4 + offsetX, y: 0.42, z: 0 };
  landmarks[362] = { x: 0.55 + offsetX, y: 0.4, z: 0 };
  landmarks[263] = { x: 0.65 + offsetX, y: 0.4, z: 0 };
  landmarks[386] = { x: 0.6 + offsetX, y: 0.38, z: 0 };
  landmarks[374] = { x: 0.6 + offsetX, y: 0.42, z: 0 };
  for (const index of [469, 470, 471, 472]) {
    landmarks[index] = { x: 0.4 + offsetX, y: 0.4, z: 0 };
  }
  for (const index of [474, 475, 476, 477]) {
    landmarks[index] = { x: 0.6 + offsetX, y: 0.4, z: 0 };
  }
  return landmarks;
}

function createFace(offsetX = 0): LandmarkerFaceResult {
  return {
    landmarks: createLandmarks(offsetX),
    blendshapes: { mouthSmileLeft: 0.2, mouthSmileRight: 0.3 },
    transformationMatrix: {
      rows: 4,
      columns: 4,
      data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  };
}

function createResult(faces: readonly LandmarkerFaceResult[]): LandmarkerFrameResult {
  return { faces, inferenceDurationMs: 20 };
}

function normalize(
  normalizer: FaceFrameNormalizer,
  result: LandmarkerFrameResult,
  frameId = 1,
) {
  return normalizer.normalize({
    frameId,
    sessionElapsedMs: frameId * 200,
    clientMonotonicMs: frameId * 200,
    capturedAt: "2026-07-20T00:00:00.000Z",
    sourceWidth: 1280,
    sourceHeight: 720,
    brightnessScore: 0.8,
    blurScore: 0.9,
    rawLaplacianVariance: 250,
    totalDurationMs: 25,
    targetFps: 5,
    actualFps: 5,
    performanceProfile: "HIGH",
    landmarkerResult: result,
  });
}

describe("FaceFrameNormalizer", () => {
  it("derives a box, pose, blendshapes, and privacy-safe geometry", () => {
    const frame = normalize(new FaceFrameNormalizer(), createResult([createFace()]));

    expect(frame.faceCount).toBe(1);
    expect(frame.primaryFace?.box.left).toBeCloseTo(0.3);
    expect(frame.primaryFace?.box.areaRatio).toBeCloseTo(0.24);
    expect(frame.primaryFace?.yaw).toBeCloseTo(0);
    expect(frame.primaryFace?.blendshapes["mouthSmileLeft"]).toBe(0.2);
    expect(frame.primaryFace?.geometry.noseToChinVerticalRatio).toBeCloseTo(0.5);
    expect(frame.primaryFace?.geometry.landmarkDisplacementScore).toBeNull();
    expect(frame.primaryFace?.eyeGaze.horizontalRatio).toBeCloseTo(0.5);
    expect(frame.primaryFace?.eyeGaze.verticalRatio).toBeCloseTo(0.5);
    expect("landmarks" in (frame.primaryFace ?? {})).toBe(false);
  });

  it("removes rigid translation before landmark activity is measured", () => {
    const normalizer = new FaceFrameNormalizer();
    normalize(normalizer, createResult([createFace()]), 1);
    const next = normalize(normalizer, createResult([createFace(0.01)]), 2);

    expect(
      next.primaryFace?.geometry.landmarkDisplacementScore,
    ).toBeLessThan(0.000001);
  });

  it("returns no primary face when detection is empty", () => {
    const frame = normalize(new FaceFrameNormalizer(), createResult([]));

    expect(frame.faceDetected).toBe(false);
    expect(frame.primaryFace).toBeNull();
  });
});

describe("face box helpers", () => {
  it("normalizes binocular iris position without exposing raw landmarks", () => {
    const landmarks = createLandmarks();
    for (const index of [469, 470, 471, 472, 474, 475, 476, 477]) {
      const point = landmarks[index];
      if (point !== undefined) landmarks[index] = { ...point, x: point.x + 0.02 };
    }

    const gaze = computeNormalizedEyeGaze(landmarks);

    expect(gaze.horizontalRatio).toBeCloseTo(0.7);
    expect(gaze.verticalRatio).toBeCloseTo(0.5);
    expect(gaze.binocularAgreementScore).toBeCloseTo(1);
  });

  it("calculates how much of an out-of-frame face remains visible", () => {
    const box = computeFaceBox([
      { x: -0.1, y: 0.2, z: 0 },
      { x: 0.3, y: 0.8, z: 0 },
    ]);

    expect(box?.inFrameRatio).toBeCloseTo(0.75);
  });

  it("selects the largest face for diagnostics", () => {
    const small = createFace();
    const large: LandmarkerFaceResult = {
      ...createFace(),
      landmarks: [
        { x: 0.1, y: 0.1, z: 0 },
        { x: 0.9, y: 0.9, z: 0 },
      ],
    };

    expect(selectPrimaryFaceBox(createResult([small, large]))?.areaRatio).toBeCloseTo(
      0.64,
    );
  });
});
