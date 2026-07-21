import type { VisionConfig } from "../config/VisionConfig.js";
import type { NormalizedPrimaryFace } from "../core/NormalizedFaceFrame.js";

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Computes observable frame-to-frame facial motion without assigning emotion. */
export function computeExpressionActivityScore(
  previous: NormalizedPrimaryFace | null,
  current: NormalizedPrimaryFace,
  config: Pick<
    VisionConfig["expressionActivity"],
    "blendshapeNames" | "blendshapeWeight" | "landmarkWeight"
  >,
): number | null {
  const components: Array<{ readonly value: number; readonly weight: number }> = [];

  if (previous !== null) {
    // Blendshape deltas describe motion between frames; absolute category values
    // are intentionally avoided because they vary substantially by user.
    const differences = config.blendshapeNames.map((name) =>
      Math.abs(
        (current.blendshapes[name] ?? 0) -
          (previous.blendshapes[name] ?? 0),
      ),
    );
    const blendshapeScore =
      differences.reduce((sum, value) => sum + value, 0) /
      differences.length;
    components.push({
      value: clampUnit(blendshapeScore),
      weight: config.blendshapeWeight,
    });
  }

  if (current.geometry.landmarkDisplacementScore !== null) {
    // The normalizer already scales displacement by face size, making it a
    // useful secondary signal when blendshape categories are weak or absent.
    components.push({
      value: clampUnit(current.geometry.landmarkDisplacementScore),
      weight: config.landmarkWeight,
    });
  }

  const availableWeight = components.reduce(
    (sum, component) => sum + component.weight,
    0,
  );
  if (availableWeight === 0) return null;

  // Re-normalize by available weight so a missing optional signal cannot make
  // an otherwise active frame appear artificially still.
  return clampUnit(
    components.reduce(
      (sum, component) => sum + component.value * component.weight,
      0,
    ) / availableWeight,
  );
}
