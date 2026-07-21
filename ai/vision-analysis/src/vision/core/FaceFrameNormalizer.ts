import { estimateHeadPose } from "./HeadPoseEstimator.js";
import type {
  FaceLandmarkPoint,
  LandmarkerFaceResult,
  LandmarkerFrameResult,
} from "./LandmarkerFrameResult.js";
import type {
  NormalizedFaceBox,
  NormalizedFaceFrame,
  NormalizedFaceGeometry,
  PerformanceProfile,
} from "./NormalizedFaceFrame.js";

const NOSE_TIP_INDEX = 1;
const UPPER_LIP_CENTER_INDEX = 13;
const CHIN_INDEX = 152;
const MOUTH_CORNER_LEFT_INDEX = 61;
const MOUTH_CORNER_RIGHT_INDEX = 291;

export interface FaceFrameNormalizationInput {
  readonly frameId: number;
  readonly sessionElapsedMs: number;
  readonly clientMonotonicMs: number;
  readonly capturedAt: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly brightnessScore: number;
  readonly blurScore: number;
  readonly rawLaplacianVariance: number;
  readonly totalDurationMs: number;
  readonly targetFps: number;
  readonly actualFps: number;
  readonly performanceProfile: PerformanceProfile;
  readonly landmarkerResult: LandmarkerFrameResult;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Computes a normalized bounding box without exposing landmark arrays. */
export function computeFaceBox(
  landmarks: readonly FaceLandmarkPoint[],
): NormalizedFaceBox | null {
  if (landmarks.length === 0) {
    return null;
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const landmark of landmarks) {
    if (
      !Number.isFinite(landmark.x) ||
      !Number.isFinite(landmark.y)
    ) {
      return null;
    }
    left = Math.min(left, landmark.x);
    top = Math.min(top, landmark.y);
    right = Math.max(right, landmark.x);
    bottom = Math.max(bottom, landmark.y);
  }

  const rawWidth = Math.max(0, right - left);
  const rawHeight = Math.max(0, bottom - top);
  const rawArea = rawWidth * rawHeight;
  const intersectionWidth = Math.max(
    0,
    Math.min(1, right) - Math.max(0, left),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(1, bottom) - Math.max(0, top),
  );
  const intersectionArea = intersectionWidth * intersectionHeight;

  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    // The visible intersection is safe to expose as a [0, 1] frame ratio.
    areaRatio: clamp(intersectionArea, 0, 1),
    inFrameRatio: rawArea === 0 ? 0 : clamp(intersectionArea / rawArea, 0, 1),
  };
}

export function selectPrimaryFaceBox(
  result: LandmarkerFrameResult,
): NormalizedFaceBox | null {
  let largestBox: NormalizedFaceBox | null = null;
  for (const face of result.faces) {
    const box = computeFaceBox(face.landmarks);
    if (
      box !== null &&
      (largestBox === null || box.areaRatio > largestBox.areaRatio)
    ) {
      largestBox = box;
    }
  }
  return largestBox;
}

/** Converts adapter data into the stable detector-facing frame contract. */
export class FaceFrameNormalizer {
  private previousLandmarks: readonly FaceLandmarkPoint[] | null = null;

  normalize(input: FaceFrameNormalizationInput): NormalizedFaceFrame {
    const primary = this.selectPrimaryFace(input.landmarkerResult.faces);
    const faceCount = input.landmarkerResult.faces.length;

    if (primary === null) {
      this.previousLandmarks = null;
      return this.createFrame(input, faceCount, null);
    }

    const box = computeFaceBox(primary.landmarks);
    if (box === null) {
      this.previousLandmarks = null;
      return this.createFrame(input, faceCount, null);
    }

    const pose = estimateHeadPose(primary.transformationMatrix);
    const geometry = this.computeGeometry(primary.landmarks, box);

    // Displacement across multiple faces is not identity-stable, so it is reset.
    this.previousLandmarks =
      faceCount === 1
        ? primary.landmarks.map((point) => ({ ...point }))
        : null;

    return this.createFrame(input, faceCount, {
      box,
      yaw: pose?.yaw ?? null,
      pitch: pose?.pitch ?? null,
      roll: pose?.roll ?? null,
      blendshapes: primary.blendshapes,
      geometry,
    });
  }

  reset(): void {
    this.previousLandmarks = null;
  }

  private selectPrimaryFace(
    faces: readonly LandmarkerFaceResult[],
  ): LandmarkerFaceResult | null {
    let selected: LandmarkerFaceResult | null = null;
    let selectedArea = -1;
    for (const face of faces) {
      const area = computeFaceBox(face.landmarks)?.areaRatio ?? -1;
      if (area > selectedArea) {
        selected = face;
        selectedArea = area;
      }
    }
    return selected;
  }

  private computeGeometry(
    landmarks: readonly FaceLandmarkPoint[],
    box: NormalizedFaceBox,
  ): NormalizedFaceGeometry {
    const faceHeight = Math.max(0.000001, box.bottom - box.top);
    const upperLip = landmarks[UPPER_LIP_CENTER_INDEX];
    const leftCorner = landmarks[MOUTH_CORNER_LEFT_INDEX];
    const rightCorner = landmarks[MOUTH_CORNER_RIGHT_INDEX];
    const nose = landmarks[NOSE_TIP_INDEX];
    const chin = landmarks[CHIN_INDEX];

    return {
      mouthCornerLiftLeft:
        upperLip === undefined || leftCorner === undefined
          ? null
          : (upperLip.y - leftCorner.y) / faceHeight,
      mouthCornerLiftRight:
        upperLip === undefined || rightCorner === undefined
          ? null
          : (upperLip.y - rightCorner.y) / faceHeight,
      noseToChinVerticalRatio:
        nose === undefined || chin === undefined
          ? null
          : Math.abs(chin.y - nose.y) / faceHeight,
      landmarkDisplacementScore: this.computeDisplacement(
        landmarks,
        box.areaRatio,
      ),
    };
  }

  private computeDisplacement(
    landmarks: readonly FaceLandmarkPoint[],
    faceAreaRatio: number,
  ): number | null {
    const previous = this.previousLandmarks;
    if (previous === null || previous.length !== landmarks.length) {
      return null;
    }

    let sum = 0;
    for (let index = 0; index < landmarks.length; index += 1) {
      const current = landmarks[index];
      const before = previous[index];
      if (current === undefined || before === undefined) {
        return null;
      }
      sum += Math.hypot(current.x - before.x, current.y - before.y);
    }

    const normalized =
      sum / landmarks.length / Math.sqrt(Math.max(faceAreaRatio, 0.000001));
    return clamp(normalized, 0, 1);
  }

  private createFrame(
    input: FaceFrameNormalizationInput,
    faceCount: number,
    primaryFace: NormalizedFaceFrame["primaryFace"],
  ): NormalizedFaceFrame {
    return {
      schemaVersion: 1,
      frameId: input.frameId,
      sessionElapsedMs: input.sessionElapsedMs,
      clientMonotonicMs: input.clientMonotonicMs,
      capturedAt: input.capturedAt,
      source: {
        width: input.sourceWidth,
        height: input.sourceHeight,
        mirrored: false,
      },
      faceDetected: faceCount > 0,
      faceCount,
      primaryFace,
      imageQuality: {
        brightnessScore: input.brightnessScore,
        blurScore: input.blurScore,
        rawLaplacianVariance: input.rawLaplacianVariance,
      },
      processing: {
        landmarkerDurationMs: input.landmarkerResult.inferenceDurationMs,
        totalDurationMs: input.totalDurationMs,
        targetFps: input.targetFps,
        actualFps: input.actualFps,
        performanceProfile: input.performanceProfile,
      },
    };
  }
}
