import type { VisionConfig } from "../config/VisionConfig.js";
import type { NormalizedPrimaryFace } from "../core/NormalizedFaceFrame.js";

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function totalVariationPerSecond(
  names: readonly string[],
  previous: NormalizedPrimaryFace,
  current: NormalizedPrimaryFace,
  observableDurationSeconds: number,
  normalizationPerSecond: number,
): { readonly score: number | null; readonly coverage: number } {
  let variation = 0;
  let observed = 0;
  for (const name of names) {
    const before = previous.blendshapes[name];
    const now = current.blendshapes[name];
    if (before === undefined || now === undefined) continue;
    variation += Math.abs(now - before);
    observed += 1;
  }
  if (observed === 0) return { score: null, coverage: 0 };
  const rate = variation / observableDurationSeconds;
  return {
    score: clampUnit(rate / normalizationPerSecond),
    coverage: observed / names.length,
  };
}

export interface ExpressionActivityScores {
  readonly upperFaceActivityScore: number | null;
  readonly lowerFaceActivityScore: number | null;
  readonly poseAlignedLandmarkActivityScore: number | null;
  readonly expressionActivityScore: number | null;
  readonly activityConfidence: number;
}

/**
 * Computes total variation per observable second. The landmark displacement is
 * already pose-aligned by the normalizer; jawOpen and cheekSquint are excluded
 * from the default blendshape groups so speech and static categories cannot
 * dominate the experimental metric.
 */
export function computeExpressionActivityScores(
  previous: NormalizedPrimaryFace | null,
  current: NormalizedPrimaryFace,
  observableDurationMs: number,
  qualityConfidence: number,
  config: Pick<
    VisionConfig["expressionActivity"],
    | "upperFaceBlendshapeNames"
    | "lowerFaceBlendshapeNames"
    | "blendshapeWeight"
    | "landmarkWeight"
    | "maximumFrameGapMs"
    | "rateNormalizationPerSecond"
  >,
): ExpressionActivityScores {
  if (
    previous === null ||
    observableDurationMs <= 0 ||
    observableDurationMs > config.maximumFrameGapMs
  ) {
    return {
      upperFaceActivityScore: null,
      lowerFaceActivityScore: null,
      poseAlignedLandmarkActivityScore: null,
      expressionActivityScore: null,
      activityConfidence: 0,
    };
  }

  const seconds = observableDurationMs / 1_000;
  const upper = totalVariationPerSecond(
    config.upperFaceBlendshapeNames,
    previous,
    current,
    seconds,
    config.rateNormalizationPerSecond,
  );
  const lower = totalVariationPerSecond(
    config.lowerFaceBlendshapeNames,
    previous,
    current,
    seconds,
    config.rateNormalizationPerSecond,
  );
  const poseAlignedLandmarkActivityScore =
    current.geometry.landmarkDisplacementScore === null
      ? null
      : clampUnit(
          current.geometry.landmarkDisplacementScore /
            seconds /
            config.rateNormalizationPerSecond,
        );

  const blendshapeScores = [upper.score, lower.score].filter(
    (value): value is number => value !== null,
  );
  const blendshapeScore =
    blendshapeScores.length === 0
      ? null
      : blendshapeScores.reduce((sum, value) => sum + value, 0) /
        blendshapeScores.length;
  const weightedComponents: Array<{
    readonly score: number;
    readonly weight: number;
  }> = [];
  if (blendshapeScore !== null) {
    weightedComponents.push({
      score: blendshapeScore,
      weight: config.blendshapeWeight,
    });
  }
  if (poseAlignedLandmarkActivityScore !== null) {
    weightedComponents.push({
      score: poseAlignedLandmarkActivityScore,
      weight: config.landmarkWeight,
    });
  }
  const weight = weightedComponents.reduce(
    (sum, component) => sum + component.weight,
    0,
  );
  const expressionActivityScore =
    weight === 0
      ? null
      : clampUnit(
          weightedComponents.reduce(
            (sum, component) => sum + component.score * component.weight,
            0,
          ) / weight,
        );
  const signalCoverage =
    (upper.coverage +
      lower.coverage +
      (poseAlignedLandmarkActivityScore === null ? 0 : 1)) /
    3;

  return {
    upperFaceActivityScore: upper.score,
    lowerFaceActivityScore: lower.score,
    poseAlignedLandmarkActivityScore,
    expressionActivityScore,
    activityConfidence: clampUnit(qualityConfidence * signalCoverage),
  };
}

/** Compatibility helper for callers that only need the combined metric. */
export function computeExpressionActivityScore(
  previous: NormalizedPrimaryFace | null,
  current: NormalizedPrimaryFace,
  observableDurationMs: number,
  qualityConfidence: number,
  config: Parameters<typeof computeExpressionActivityScores>[4],
): number | null {
  return computeExpressionActivityScores(
    previous,
    current,
    observableDurationMs,
    qualityConfidence,
    config,
  ).expressionActivityScore;
}
