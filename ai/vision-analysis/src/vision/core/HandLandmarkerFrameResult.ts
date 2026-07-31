/** MediaPipe-independent hand point kept inside the browser analysis path. */
export interface HandLandmarkPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Raw adapter output for one hand before local normalization. */
export interface LandmarkerHandResult {
  readonly landmarks: readonly HandLandmarkPoint[];
  readonly handedness: "LEFT" | "RIGHT" | "UNKNOWN";
  /**
   * MediaPipe's handedness classification confidence. This is not a general
   * guarantee that every landmark is correct.
   */
  readonly handednessConfidence: number;
}

/** Vendor-neutral result returned by the Hand Landmarker adapter. */
export interface HandLandmarkerFrameResult {
  readonly hands: readonly LandmarkerHandResult[];
  readonly inferenceDurationMs: number;
}
