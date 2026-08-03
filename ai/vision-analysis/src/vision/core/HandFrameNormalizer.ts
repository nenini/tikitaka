import type {
  HandLandmarkerFrameResult,
  HandLandmarkPoint,
} from "./HandLandmarkerFrameResult.js";
import type {
  NormalizedHand,
  NormalizedHandBox,
} from "./NormalizedHand.js";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Computes the visible hand box. Invalid or empty landmark sets are rejected
 * instead of being converted into a fake hand at the center of the frame.
 */
export function computeHandBox(
  landmarks: readonly HandLandmarkPoint[],
): NormalizedHandBox | null {
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
      !Number.isFinite(landmark.y) ||
      !Number.isFinite(landmark.z)
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
  const visibleWidth = Math.max(0, Math.min(1, right) - Math.max(0, left));
  const visibleHeight = Math.max(0, Math.min(1, bottom) - Math.max(0, top));
  const visibleArea = visibleWidth * visibleHeight;

  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    areaRatio: clamp(visibleArea, 0, 1),
    inFrameRatio:
      rawArea === 0 ? 0 : clamp(visibleArea / rawArea, 0, 1),
  };
}

/**
 * Converts adapter output into stable browser-local observations. Copying the
 * points prevents a vendor-owned result object from leaking across boundaries.
 */
export function normalizeHands(
  result: HandLandmarkerFrameResult,
): readonly NormalizedHand[] {
  const normalized: NormalizedHand[] = [];
  for (const hand of result.hands) {
    const box = computeHandBox(hand.landmarks);
    if (box === null) {
      continue;
    }
    normalized.push({
      handedness: hand.handedness,
      handednessConfidence: clamp(hand.handednessConfidence, 0, 1),
      box,
      landmarks: hand.landmarks.map((point) => ({ ...point })),
    });
  }
  return normalized;
}
