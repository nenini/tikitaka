import type {
  NormalizedEyeGaze,
  NormalizedFaceFrame,
} from "../../src/vision/core/NormalizedFaceFrame.js";

export interface NormalizedFrameOptions {
  readonly timestampMs?: number;
  readonly faceDetected?: boolean;
  readonly faceCount?: number;
  readonly faceAreaRatio?: number;
  readonly inFrameRatio?: number;
  readonly brightnessScore?: number;
  readonly backlightScore?: number;
  readonly blurScore?: number;
  readonly yaw?: number | null;
  readonly pitch?: number | null;
  readonly roll?: number | null;
  readonly centerX?: number;
  readonly centerY?: number;
  readonly blendshapes?: Readonly<Record<string, number>>;
  readonly landmarkDisplacementScore?: number | null;
  readonly eyeGaze?: NormalizedEyeGaze;
}

export function createNormalizedFaceFrame(
  options: NormalizedFrameOptions = {},
): NormalizedFaceFrame {
  const timestampMs = options.timestampMs ?? 0;
  const faceDetected = options.faceDetected ?? true;
  const faceCount = options.faceCount ?? (faceDetected ? 1 : 0);

  return {
    schemaVersion: 1,
    frameId: Math.floor(timestampMs) + 1,
    sessionElapsedMs: timestampMs,
    clientMonotonicMs: timestampMs,
    capturedAt: new Date(
      Date.parse("2026-07-20T00:00:00.000Z") + timestampMs,
    ).toISOString(),
    source: { width: 1280, height: 720, mirrored: false },
    faceDetected,
    faceCount,
    primaryFace: faceDetected
      ? {
          box: {
            left: 0.3,
            top: 0.2,
            right: 0.7,
            bottom: 0.8,
            centerX: options.centerX ?? 0.5,
            centerY: options.centerY ?? 0.5,
            areaRatio: options.faceAreaRatio ?? 0.24,
            inFrameRatio: options.inFrameRatio ?? 1,
          },
          yaw: options.yaw ?? 0,
          pitch: options.pitch ?? 0,
          roll: options.roll ?? 0,
          blendshapes: options.blendshapes ?? {},
          missingRequiredBlendshapes: [
            "mouthSmileLeft",
            "mouthSmileRight",
            "eyeBlinkLeft",
            "eyeBlinkRight",
          ].filter(
            (name) => options.blendshapes?.[name] === undefined,
          ),
          geometry: {
            mouthCornerLiftLeft: 0,
            mouthCornerLiftRight: 0,
            noseToChinVerticalRatio: 0.3,
            landmarkDisplacementScore:
              options.landmarkDisplacementScore ?? null,
          },
          eyeGaze: options.eyeGaze ?? {
            left: {
              horizontalRatio: 0.5,
              verticalRatio: 0.5,
            },
            right: {
              horizontalRatio: 0.5,
              verticalRatio: 0.5,
            },
            horizontalRatio: 0.5,
            verticalRatio: 0.5,
            binocularAgreementScore: 1,
          },
        }
      : null,
    handDetected: false,
    handCount: 0,
    hands: [],
    imageQuality: {
      brightnessScore: options.brightnessScore ?? 0.8,
      backlightScore: options.backlightScore ?? 1,
      blurScore: options.blurScore ?? 0.8,
      rawLaplacianVariance: 240,
    },
    processing: {
      landmarkerDurationMs: 20,
      faceLandmarkerDurationMs: 20,
      handLandmarkerDurationMs: 0,
      totalDurationMs: 25,
      targetFps: 5,
      actualFps: 5,
      performanceProfile: "HIGH",
    },
  };
}
