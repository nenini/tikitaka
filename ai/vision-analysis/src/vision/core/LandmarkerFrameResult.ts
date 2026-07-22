/** MediaPipe-independent landmark used only inside the browser analysis worker. */
export interface FaceLandmarkPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FacialTransformMatrix {
  readonly rows: number;
  readonly columns: number;
  readonly data: readonly number[];
}

export interface LandmarkerFaceResult {
  readonly landmarks: readonly FaceLandmarkPoint[];
  readonly blendshapes: Readonly<Record<string, number>>;
  readonly transformationMatrix: FacialTransformMatrix | null;
}

/**
 * Adapter-owned result. MediaPipe classes never cross this boundary, and this
 * object is never part of the server event contract.
 */
export interface LandmarkerFrameResult {
  readonly faces: readonly LandmarkerFaceResult[];
  readonly inferenceDurationMs: number;
}

