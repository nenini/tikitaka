import type {
  NormalizedFaceFrame,
  NormalizedRegion,
} from "../core/NormalizedFaceFrame.js";
import type { NormalizedHand } from "../core/NormalizedHand.js";
import type { HandLandmarkPoint } from "../core/HandLandmarkerFrameResult.js";
import {
  HysteresisGate,
  type HysteresisGateState,
  type HysteresisGateTransition,
} from "../filters/HysteresisGate.js";

export interface HandOverMouthDetectorOptions {
  /** Mouth coverage required to begin an occlusion candidate. */
  readonly entryOverlapRatio: number;
  /** Coverage below this value begins recovery. */
  readonly recoveryOverlapRatio: number;
  readonly entryDurationMs: number;
  readonly recoveryDurationMs: number;
  readonly minimumHandednessConfidence: number;
}

export const defaultHandOverMouthOptions: HandOverMouthDetectorOptions = {
  // Local demo measurements separated intentional mouth covering (>= 45%)
  // from chin-resting poses (roughly 27-35%).
  entryOverlapRatio: 0.45,
  recoveryOverlapRatio: 0.35,
  entryDurationMs: 400,
  recoveryDurationMs: 400,
  minimumHandednessConfidence: 0.7,
};

export type HandOverMouthMeasurementStatus =
  | "UNAVAILABLE"
  | "CLEAR"
  | "UNCERTAIN"
  | "OCCLUDED";

export interface HandOverMouthState {
  readonly active: boolean;
  readonly gateState: HysteresisGateState;
  readonly measurementStatus: HandOverMouthMeasurementStatus;
  readonly overlapRatio: number | null;
  readonly matchedHandedness: NormalizedHand["handedness"] | null;
  readonly matchedHandConfidence: number | null;
  readonly transition: HysteresisGateTransition | null;
}

interface Point2d {
  readonly x: number;
  readonly y: number;
}

const PALM_INDICES = [0, 1, 5, 9, 13, 17] as const;
const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
] as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pointInPolygon(point: Point2d, polygon: readonly Point2d[]): boolean {
  let inside = false;
  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];
    if (current === undefined || previous === undefined) continue;
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y || Number.EPSILON) +
          current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToSegment(
  point: Point2d,
  start: Point2d,
  end: Point2d,
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  if (squaredLength <= Number.EPSILON) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const projection = clamp01(
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
      squaredLength,
  );
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.y - (start.y + projection * deltaY),
  );
}

function handCoversPoint(hand: NormalizedHand, point: Point2d): boolean {
  const palm = PALM_INDICES.map((index) => hand.landmarks[index]).filter(
    (landmark): landmark is HandLandmarkPoint => landmark !== undefined,
  );
  if (palm.length === PALM_INDICES.length && pointInPolygon(point, palm)) {
    return true;
  }

  // Finger thickness is scaled from the palm width, so the same rule works
  // when the user moves closer to or farther from the camera.
  const indexBase = hand.landmarks[5];
  const pinkyBase = hand.landmarks[17];
  const palmWidth =
    indexBase === undefined || pinkyBase === undefined
      ? Math.sqrt(hand.box.areaRatio)
      : Math.hypot(indexBase.x - pinkyBase.x, indexBase.y - pinkyBase.y);
  const fingerRadius = Math.max(0.006, palmWidth * 0.09);
  return HAND_CONNECTIONS.some(([startIndex, endIndex]) => {
    const start = hand.landmarks[startIndex];
    const end = hand.landmarks[endIndex];
    return (
      start !== undefined &&
      end !== undefined &&
      distanceToSegment(point, start, end) <= fingerRadius
    );
  });
}

/**
 * Estimates how much of the mouth ROI is covered by one or more hands. A
 * bounded sample grid avoids exposing or transferring a raw segmentation mask.
 */
export function calculateHandOverMouthOverlap(
  mouthRegion: NormalizedRegion,
  hands: readonly NormalizedHand[],
  minimumHandednessConfidence = 0.7,
): {
  readonly overlapRatio: number;
  readonly matchedHand: NormalizedHand | null;
} {
  const eligibleHands = hands.filter(
    (hand) => hand.handednessConfidence >= minimumHandednessConfidence,
  );
  if (eligibleHands.length === 0) {
    return { overlapRatio: 0, matchedHand: null };
  }

  const columns = 24;
  const rows = 16;
  const width = Math.max(0, mouthRegion.right - mouthRegion.left);
  const height = Math.max(0, mouthRegion.bottom - mouthRegion.top);
  if (width <= Number.EPSILON || height <= Number.EPSILON) {
    return { overlapRatio: 0, matchedHand: null };
  }

  let coveredSamples = 0;
  const coverageByHand = new Map<NormalizedHand, number>();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = {
        x: mouthRegion.left + ((column + 0.5) / columns) * width,
        y: mouthRegion.top + ((row + 0.5) / rows) * height,
      };
      const coveringHands = eligibleHands.filter((hand) =>
        handCoversPoint(hand, point),
      );
      if (coveringHands.length > 0) coveredSamples += 1;
      for (const hand of coveringHands) {
        coverageByHand.set(hand, (coverageByHand.get(hand) ?? 0) + 1);
      }
    }
  }

  const matchedHand =
    [...coverageByHand.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    null;
  return {
    overlapRatio: coveredSamples / (columns * rows),
    matchedHand,
  };
}

/** Stateful, browser-local occlusion gate. It does not publish Vision events. */
export class HandOverMouthDetector {
  private readonly gate: HysteresisGate;

  constructor(
    private readonly options: HandOverMouthDetectorOptions =
      defaultHandOverMouthOptions,
  ) {
    if (
      options.recoveryOverlapRatio >= options.entryOverlapRatio ||
      options.entryOverlapRatio > 1 ||
      options.recoveryOverlapRatio < 0
    ) {
      throw new RangeError("hand-over-mouth overlap thresholds are invalid");
    }
    this.gate = new HysteresisGate(
      options.entryDurationMs,
      options.recoveryDurationMs,
    );
  }

  update(frame: NormalizedFaceFrame): HandOverMouthState {
    const mouthRegion = frame.primaryFace?.geometry.mouthRegion ?? null;
    if (mouthRegion === null) {
      const transition = this.gate.update(
        false,
        true,
        frame.clientMonotonicMs,
      );
      return this.createState(null, null, transition);
    }

    const measurement = calculateHandOverMouthOverlap(
      mouthRegion,
      frame.hands,
      this.options.minimumHandednessConfidence,
    );
    const transition = this.gate.update(
      measurement.overlapRatio >= this.options.entryOverlapRatio,
      measurement.overlapRatio <= this.options.recoveryOverlapRatio,
      frame.clientMonotonicMs,
    );
    return this.createState(
      measurement.overlapRatio,
      measurement.matchedHand,
      transition,
    );
  }

  reset(): void {
    this.gate.reset();
  }

  private createState(
    overlapRatio: number | null,
    matchedHand: NormalizedHand | null,
    transition: HysteresisGateTransition | null,
  ): HandOverMouthState {
    const snapshot = this.gate.getSnapshot();
    const measurementStatus: HandOverMouthMeasurementStatus =
      overlapRatio === null
        ? "UNAVAILABLE"
        : snapshot.active
          ? "OCCLUDED"
          : overlapRatio >= this.options.entryOverlapRatio
            ? "UNCERTAIN"
            : "CLEAR";
    return {
      active: snapshot.active,
      gateState: snapshot.state,
      measurementStatus,
      overlapRatio,
      matchedHandedness: matchedHand?.handedness ?? null,
      matchedHandConfidence: matchedHand?.handednessConfidence ?? null,
      transition,
    };
  }
}
