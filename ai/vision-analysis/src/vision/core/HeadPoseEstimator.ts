import type { FacialTransformMatrix } from "./LandmarkerFrameResult.js";

export interface HeadPose {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
}

const RADIANS_TO_DEGREES = 180 / Math.PI;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Extracts Euler angles from the row-major 4x4 facial transform matrix.
 *
 * The mathematical convention is Rz(roll) * Ry(yaw) * Rx(pitch). MediaPipe's
 * camera-axis signs still need validation with mirrored and unmirrored test
 * videos before product thresholds are finalized.
 */
export function estimateHeadPose(
  matrix: FacialTransformMatrix | null,
): HeadPose | null {
  if (
    matrix === null ||
    matrix.rows !== 4 ||
    matrix.columns !== 4 ||
    matrix.data.length !== 16 ||
    matrix.data.some((value) => !Number.isFinite(value))
  ) {
    return null;
  }

  const r00 = matrix.data[0];
  const r10 = matrix.data[4];
  const r20 = matrix.data[8];
  const r21 = matrix.data[9];
  const r22 = matrix.data[10];
  if (
    r00 === undefined ||
    r10 === undefined ||
    r20 === undefined ||
    r21 === undefined ||
    r22 === undefined
  ) {
    return null;
  }

  const yawRadians = Math.asin(clamp(-r20, -1, 1));
  const pitchRadians = Math.atan2(r21, r22);
  const rollRadians = Math.atan2(r10, r00);

  return {
    yaw: yawRadians * RADIANS_TO_DEGREES,
    pitch: pitchRadians * RADIANS_TO_DEGREES,
    roll: rollRadians * RADIANS_TO_DEGREES,
  };
}

