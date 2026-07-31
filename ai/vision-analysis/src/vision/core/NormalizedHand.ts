import type { HandLandmarkPoint } from "./HandLandmarkerFrameResult.js";

/** Axis-aligned hand area in normalized, non-mirrored camera coordinates. */
export interface NormalizedHandBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly areaRatio: number;
  readonly inFrameRatio: number;
}

/**
 * Browser-local hand observation. The 21 points are needed by later gesture
 * rules, but this object is not included in the public Vision event contract.
 */
export interface NormalizedHand {
  readonly handedness: "LEFT" | "RIGHT" | "UNKNOWN";
  readonly handednessConfidence: number;
  readonly box: NormalizedHandBox;
  readonly landmarks: readonly HandLandmarkPoint[];
}
