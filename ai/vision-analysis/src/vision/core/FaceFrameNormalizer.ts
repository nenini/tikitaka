import { estimateHeadPose } from "./HeadPoseEstimator.js";
import type {
  FaceLandmarkPoint,
  LandmarkerFaceResult,
  LandmarkerFrameResult,
} from "./LandmarkerFrameResult.js";
import { normalizeHands } from "./HandFrameNormalizer.js";
import type { HandLandmarkerFrameResult } from "./HandLandmarkerFrameResult.js";
import type {
  NormalizedFaceBox,
  NormalizedFaceFrame,
  NormalizedFaceGeometry,
  NormalizedEyeGaze,
  NormalizedEyePosition,
  NormalizedRegion,
  PerformanceProfile,
} from "./NormalizedFaceFrame.js";

const NOSE_TIP_INDEX = 1;
const UPPER_LIP_CENTER_INDEX = 13;
const CHIN_INDEX = 152;
const MOUTH_CORNER_LEFT_INDEX = 61;
const MOUTH_CORNER_RIGHT_INDEX = 291;
// Lip contour points used only to derive a browser-local mouth region.
const MOUTH_REGION_INDICES = [
  0, 13, 14, 17, 37, 39, 40, 61, 78, 81, 82, 84, 87, 88, 91, 95, 146,
  178, 181, 185, 191, 267, 269, 270, 291, 308, 311, 312, 314, 317, 318,
  321, 324, 375, 402, 405, 409, 415,
] as const;
const REQUIRED_BLENDSHAPES = [
  "mouthSmileLeft",
  "mouthSmileRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
] as const;

// Indices follow MediaPipe's official Face Landmarker eye/iris connections.
const LEFT_EYE = {
  cornerStart: 362,
  cornerEnd: 263,
  upperLid: 386,
  lowerLid: 374,
  irisRing: [474, 475, 476, 477],
} as const;
const RIGHT_EYE = {
  cornerStart: 33,
  cornerEnd: 133,
  upperLid: 159,
  lowerLid: 145,
  irisRing: [469, 470, 471, 472],
} as const;

export interface FaceFrameNormalizationInput {
  readonly frameId: number;
  readonly sessionElapsedMs: number;
  readonly clientMonotonicMs: number;
  readonly capturedAt: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly brightnessScore: number;
  readonly backlightScore?: number;
  readonly blurScore: number;
  readonly rawLaplacianVariance: number;
  readonly totalDurationMs: number;
  readonly targetFps: number;
  readonly actualFps: number;
  readonly performanceProfile: PerformanceProfile;
  readonly landmarkerResult: LandmarkerFrameResult;
  /** Undefined only when hand analysis is explicitly disabled. */
  readonly handLandmarkerResult?: HandLandmarkerFrameResult;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface EyeLandmarkDefinition {
  readonly cornerStart: number;
  readonly cornerEnd: number;
  readonly upperLid: number;
  readonly lowerLid: number;
  readonly irisRing: readonly number[];
}

function projectRatio(
  point: FaceLandmarkPoint,
  start: FaceLandmarkPoint,
  end: FaceLandmarkPoint,
): number | null {
  const axisX = end.x - start.x;
  const axisY = end.y - start.y;
  const squaredLength = axisX * axisX + axisY * axisY;
  if (squaredLength <= Number.EPSILON) return null;
  return clamp(
    ((point.x - start.x) * axisX + (point.y - start.y) * axisY) /
      squaredLength,
    0,
    1,
  );
}

function computeEyePosition(
  landmarks: readonly FaceLandmarkPoint[],
  definition: EyeLandmarkDefinition,
): NormalizedEyePosition | null {
  const cornerStart = landmarks[definition.cornerStart];
  const cornerEnd = landmarks[definition.cornerEnd];
  const upperLid = landmarks[definition.upperLid];
  const lowerLid = landmarks[definition.lowerLid];
  const irisPoints = definition.irisRing.map((index) => landmarks[index]);
  if (
    cornerStart === undefined ||
    cornerEnd === undefined ||
    upperLid === undefined ||
    lowerLid === undefined ||
    irisPoints.some((point) => point === undefined)
  ) {
    return null;
  }

  const definedIrisPoints = irisPoints.filter(
    (point): point is FaceLandmarkPoint => point !== undefined,
  );
  const irisCenter: FaceLandmarkPoint = {
    x:
      definedIrisPoints.reduce((sum, point) => sum + point.x, 0) /
      definedIrisPoints.length,
    y:
      definedIrisPoints.reduce((sum, point) => sum + point.y, 0) /
      definedIrisPoints.length,
    z:
      definedIrisPoints.reduce((sum, point) => sum + point.z, 0) /
      definedIrisPoints.length,
  };
  const horizontalRatio = projectRatio(irisCenter, cornerStart, cornerEnd);
  const verticalRatio = projectRatio(irisCenter, upperLid, lowerLid);
  if (horizontalRatio === null || verticalRatio === null) return null;
  return { horizontalRatio, verticalRatio };
}

/**
 * Normalizes iris position inside each eye. This is an attention proxy only:
 * MediaPipe iris tracking does not infer the actual point a person is viewing.
 */
export function computeNormalizedEyeGaze(
  landmarks: readonly FaceLandmarkPoint[],
): NormalizedEyeGaze {
  const left = computeEyePosition(landmarks, LEFT_EYE);
  const right = computeEyePosition(landmarks, RIGHT_EYE);
  const available = [left, right].filter(
    (eye): eye is NormalizedEyePosition => eye !== null,
  );
  const horizontalRatio =
    available.length === 0
      ? null
      : available.reduce((sum, eye) => sum + eye.horizontalRatio, 0) /
        available.length;
  const verticalRatio =
    available.length === 0
      ? null
      : available.reduce((sum, eye) => sum + eye.verticalRatio, 0) /
        available.length;
  const binocularAgreementScore =
    left === null || right === null
      ? null
      : clamp(
          1 -
            Math.max(
              Math.abs(left.horizontalRatio - right.horizontalRatio),
              Math.abs(left.verticalRatio - right.verticalRatio),
            ),
          0,
          1,
        );
  return {
    left,
    right,
    horizontalRatio,
    verticalRatio,
    binocularAgreementScore,
  };
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

/**
 * Builds a padded mouth ROI from lip landmarks. The padding absorbs small
 * landmark jitter and covers the immediate area a hand would physically hide.
 */
export function computeMouthRegion(
  landmarks: readonly FaceLandmarkPoint[],
): NormalizedRegion | null {
  const points = MOUTH_REGION_INDICES.map((index) => landmarks[index]);
  if (points.some((point) => point === undefined)) return null;
  const defined = points.filter(
    (point): point is FaceLandmarkPoint => point !== undefined,
  );
  const left = Math.min(...defined.map((point) => point.x));
  const right = Math.max(...defined.map((point) => point.x));
  const top = Math.min(...defined.map((point) => point.y));
  const bottom = Math.max(...defined.map((point) => point.y));
  const width = right - left;
  const height = bottom - top;
  if (width <= Number.EPSILON || height <= Number.EPSILON) return null;

  const horizontalPadding = width * 0.25;
  const verticalPadding = height * 0.35;
  return {
    left: clamp(left - horizontalPadding, 0, 1),
    top: clamp(top - verticalPadding, 0, 1),
    right: clamp(right + horizontalPadding, 0, 1),
    bottom: clamp(bottom + verticalPadding, 0, 1),
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
    const eyeGaze = computeNormalizedEyeGaze(primary.landmarks);

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
      missingRequiredBlendshapes: REQUIRED_BLENDSHAPES.filter(
        (name) => primary.blendshapes[name] === undefined,
      ),
      geometry,
      eyeGaze,
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
      mouthRegion: computeMouthRegion(landmarks),
      noseToChinVerticalRatio:
        nose === undefined || chin === undefined
          ? null
          : Math.abs(chin.y - nose.y) / faceHeight,
      landmarkDisplacementScore: this.computeDisplacement(
        landmarks,
      ),
    };
  }

  private computeDisplacement(
    landmarks: readonly FaceLandmarkPoint[],
  ): number | null {
    const previous = this.previousLandmarks;
    if (previous === null || previous.length !== landmarks.length) {
      return null;
    }

    const currentCenter = this.landmarkCenter(landmarks);
    const previousCenter = this.landmarkCenter(previous);
    const currentScale = this.landmarkScale(landmarks, currentCenter);
    const previousScale = this.landmarkScale(previous, previousCenter);
    if (currentScale === 0 || previousScale === 0) return null;

    let dot = 0;
    let cross = 0;
    for (let index = 0; index < landmarks.length; index += 1) {
      const current = landmarks[index];
      const before = previous[index];
      if (current === undefined || before === undefined) {
        return null;
      }
      const currentX = (current.x - currentCenter.x) / currentScale;
      const currentY = (current.y - currentCenter.y) / currentScale;
      const previousX = (before.x - previousCenter.x) / previousScale;
      const previousY = (before.y - previousCenter.y) / previousScale;
      dot += previousX * currentX + previousY * currentY;
      cross += previousX * currentY - previousY * currentX;
    }

    const angle = Math.atan2(cross, dot);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    let sum = 0;
    for (let index = 0; index < landmarks.length; index += 1) {
      const current = landmarks[index];
      const before = previous[index];
      if (current === undefined || before === undefined) return null;
      const currentX = (current.x - currentCenter.x) / currentScale;
      const currentY = (current.y - currentCenter.y) / currentScale;
      const previousX = (before.x - previousCenter.x) / previousScale;
      const previousY = (before.y - previousCenter.y) / previousScale;
      const alignedX = previousX * cosine - previousY * sine;
      const alignedY = previousX * sine + previousY * cosine;
      sum += Math.hypot(currentX - alignedX, currentY - alignedY);
    }
    return clamp(sum / landmarks.length, 0, 1);
  }

  private landmarkCenter(
    landmarks: readonly FaceLandmarkPoint[],
  ): { readonly x: number; readonly y: number } {
    const sum = landmarks.reduce(
      (result, point) => ({
        x: result.x + point.x,
        y: result.y + point.y,
      }),
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / Math.max(landmarks.length, 1),
      y: sum.y / Math.max(landmarks.length, 1),
    };
  }

  private landmarkScale(
    landmarks: readonly FaceLandmarkPoint[],
    center: { readonly x: number; readonly y: number },
  ): number {
    const squared = landmarks.reduce(
      (sum, point) =>
        sum + (point.x - center.x) ** 2 + (point.y - center.y) ** 2,
      0,
    );
    return Math.sqrt(squared / Math.max(landmarks.length, 1));
  }

  private createFrame(
    input: FaceFrameNormalizationInput,
    faceCount: number,
    primaryFace: NormalizedFaceFrame["primaryFace"],
  ): NormalizedFaceFrame {
    const hands =
      input.handLandmarkerResult === undefined
        ? []
        : normalizeHands(input.handLandmarkerResult);
    const handLandmarkerDurationMs =
      input.handLandmarkerResult?.inferenceDurationMs ?? 0;
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
      handDetected: hands.length > 0,
      handCount: hands.length,
      hands,
      imageQuality: {
        brightnessScore: input.brightnessScore,
        backlightScore: input.backlightScore ?? 1,
        blurScore: input.blurScore,
        rawLaplacianVariance: input.rawLaplacianVariance,
      },
      processing: {
        landmarkerDurationMs:
          input.landmarkerResult.inferenceDurationMs +
          handLandmarkerDurationMs,
        faceLandmarkerDurationMs:
          input.landmarkerResult.inferenceDurationMs,
        handLandmarkerDurationMs,
        totalDurationMs: input.totalDurationMs,
        targetFps: input.targetFps,
        actualFps: input.actualFps,
        performanceProfile: input.performanceProfile,
      },
    };
  }
}
