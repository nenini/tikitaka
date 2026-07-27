import { z } from "zod";

import {
  FACE_QUALITY_REASONS,
  PERFORMANCE_PROFILES,
} from "../core/NormalizedFaceFrame.js";
import { EPISODE_TERMINATION_REASONS } from "./VisionEvent.js";

const nonNegativeFiniteNumberSchema = z.number().nonnegative();
const unitScoreSchema = z.number().min(0).max(1);
const nullableFiniteNumberSchema = z.number().nullable();
const startedPayloadShape = {
  observedStartElapsedMs: nonNegativeFiniteNumberSchema,
} as const;
const endedPayloadShape = {
  observedEndElapsedMs: nonNegativeFiniteNumberSchema,
  wallDurationMs: nonNegativeFiniteNumberSchema,
  observedDurationMs: nonNegativeFiniteNumberSchema,
  unobservedDurationMs: nonNegativeFiniteNumberSchema,
} as const;

const eventEnvelopeSchema = z
  .object({
    eventId: z.uuid(),
    version: z.literal(3),
    sessionId: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    clientInstanceId: z.uuid(),
    seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sessionElapsedMs: nonNegativeFiniteNumberSchema,
    clientMonotonicMs: nonNegativeFiniteNumberSchema,
    occurredAt: z.string().datetime({ offset: true }),
    confidence: unitScoreSchema,
    measurementConfidence: unitScoreSchema.optional(),
    signalClarity: unitScoreSchema.optional(),
    personalizationConfidence: unitScoreSchema.optional(),
    evidenceStrength: unitScoreSchema.optional(),
    baselineMode: z
      .enum([
        "PERSONALIZED",
        "MONOCULAR_LEFT",
        "MONOCULAR_RIGHT",
        "COLLECTING",
        "GLOBAL_FALLBACK",
        "UNAVAILABLE",
        "BASELINE_UNCERTAIN",
      ])
      .optional(),
    coachingEligible: z.boolean().optional(),
    baselineEpoch: z.number().int().nonnegative().optional(),
    modelVersion: z.string().min(1).max(128),
    ruleVersion: z.string().min(1).max(128),
  })
  .strict();

function behaviorEventSchema<
  TEventType extends string,
  TSource extends string,
  TPayload extends z.ZodRawShape,
>(
  eventType: TEventType,
  source: TSource,
  payload: TPayload,
) {
  return eventEnvelopeSchema
    .extend({
      eventType: z.literal(eventType),
      kind: z.literal("behavior"),
      source: z.literal(source),
      episodeId: z.uuid().nullable(),
      payload: z.object(payload).strict(),
    })
    .strict();
}

const faceMissingStartedSchema = behaviorEventSchema(
  "FACE_MISSING_STARTED",
  "FACE_QUALITY_DETECTOR",
  startedPayloadShape,
);

const faceMissingEndedSchema = behaviorEventSchema(
  "FACE_MISSING_ENDED",
  "FACE_QUALITY_DETECTOR",
  endedPayloadShape,
);

const multipleFacesDetectedSchema = behaviorEventSchema(
  "MULTIPLE_FACES_DETECTED",
  "FACE_QUALITY_DETECTOR",
  {
    ...startedPayloadShape,
    faceCount: z.number().int().min(2),
  },
);

const lowLightStartedSchema = behaviorEventSchema(
  "LOW_LIGHT_STARTED",
  "FACE_QUALITY_DETECTOR",
  {
    ...startedPayloadShape,
    brightnessScore: unitScoreSchema,
    entryThreshold: unitScoreSchema,
  },
);

const lowLightEndedSchema = behaviorEventSchema(
  "LOW_LIGHT_ENDED",
  "FACE_QUALITY_DETECTOR",
  {
    ...endedPayloadShape,
    brightnessScore: unitScoreSchema,
  },
);

const faceTooSmallStartedSchema = behaviorEventSchema(
  "FACE_TOO_SMALL_STARTED",
  "FACE_QUALITY_DETECTOR",
  {
    ...startedPayloadShape,
    faceAreaRatio: unitScoreSchema,
    entryThreshold: unitScoreSchema,
  },
);

const faceTooSmallEndedSchema = behaviorEventSchema(
  "FACE_TOO_SMALL_ENDED",
  "FACE_QUALITY_DETECTOR",
  {
    ...endedPayloadShape,
    faceAreaRatio: unitScoreSchema,
  },
);

const analysisUnavailableSchema = behaviorEventSchema(
  "ANALYSIS_UNAVAILABLE",
  "FACE_QUALITY_DETECTOR",
  {
    ...startedPayloadShape,
    reasons: z.array(z.enum(FACE_QUALITY_REASONS)).min(1),
  },
);

const analysisRecoveredSchema = behaviorEventSchema(
  "ANALYSIS_RECOVERED",
  "FACE_QUALITY_DETECTOR",
  endedPayloadShape,
);

const gazeAwayStartedSchema = behaviorEventSchema(
  "GAZE_AWAY_STARTED",
  "SCREEN_ATTENTION_DETECTOR",
  {
    ...startedPayloadShape,
    yawDelta: nullableFiniteNumberSchema,
    pitchDelta: nullableFiniteNumberSchema,
    rollDelta: nullableFiniteNumberSchema,
    centerDeltaX: nullableFiniteNumberSchema,
    centerDeltaY: nullableFiniteNumberSchema,
    gazeHorizontalDelta: nullableFiniteNumberSchema.optional(),
    gazeVerticalDelta: nullableFiniteNumberSchema.optional(),
  },
);

const gazeAwayEndedSchema = behaviorEventSchema(
  "GAZE_AWAY_ENDED",
  "SCREEN_ATTENTION_DETECTOR",
  {
    ...endedPayloadShape,
    terminationReason: z.enum(EPISODE_TERMINATION_REASONS),
  },
);

const prolongedGazeAwaySchema = behaviorEventSchema(
  "PROLONGED_GAZE_AWAY",
  "SCREEN_ATTENTION_DETECTOR",
  {
    activeDurationMs: nonNegativeFiniteNumberSchema,
    yawDelta: nullableFiniteNumberSchema,
    pitchDelta: nullableFiniteNumberSchema,
    gazeHorizontalDelta: nullableFiniteNumberSchema.optional(),
    gazeVerticalDelta: nullableFiniteNumberSchema.optional(),
  },
);

const smileStartedSchema = behaviorEventSchema(
  "SMILE_STARTED",
  "SMILE_EXPRESSION_DETECTOR",
  {
    ...startedPayloadShape,
    smileScore: unitScoreSchema,
    baselineDelta: z.number(),
  },
);

const smileEndedSchema = behaviorEventSchema(
  "SMILE_ENDED",
  "SMILE_EXPRESSION_DETECTOR",
  {
    ...endedPayloadShape,
    peakSmileScore: unitScoreSchema,
    meanSmileScore: unitScoreSchema,
    terminationReason: z.enum(EPISODE_TERMINATION_REASONS),
  },
);

const nodEventSchema = behaviorEventSchema(
  "NOD_EVENT",
  "NOD_DETECTOR",
  {
    amplitudeDegrees: z.number().positive(),
    durationMs: z.number().positive(),
    downstrokeMs: z.number().positive(),
    upstrokeMs: z.number().positive(),
  },
);

const lowExpressionActivityStartedSchema = behaviorEventSchema(
  "LOW_EXPRESSION_ACTIVITY_STARTED",
  "EXPRESSION_ACTIVITY_DETECTOR",
  {
    ...startedPayloadShape,
    activityScore: unitScoreSchema,
    baselineActivityScore: unitScoreSchema.nullable(),
    windowMs: z.number().positive(),
  },
);

const lowExpressionActivityEndedSchema = behaviorEventSchema(
  "LOW_EXPRESSION_ACTIVITY_ENDED",
  "EXPRESSION_ACTIVITY_DETECTOR",
  {
    ...endedPayloadShape,
    activityScore: unitScoreSchema,
    terminationReason: z.enum(EPISODE_TERMINATION_REASONS),
  },
);

export const visionBehaviorEventSchema = z
  .discriminatedUnion("eventType", [
    faceMissingStartedSchema,
    faceMissingEndedSchema,
    multipleFacesDetectedSchema,
    lowLightStartedSchema,
    lowLightEndedSchema,
    faceTooSmallStartedSchema,
    faceTooSmallEndedSchema,
    analysisUnavailableSchema,
    analysisRecoveredSchema,
    gazeAwayStartedSchema,
    gazeAwayEndedSchema,
    prolongedGazeAwaySchema,
    smileStartedSchema,
    smileEndedSchema,
    nodEventSchema,
    lowExpressionActivityStartedSchema,
    lowExpressionActivityEndedSchema,
  ])
  .superRefine((event, context) => {
    const payload: object = event.payload;
    const wall = Reflect.get(payload, "wallDurationMs");
    const observed = Reflect.get(payload, "observedDurationMs");
    const unobserved = Reflect.get(payload, "unobservedDurationMs");
    if (
      typeof wall === "number" &&
      typeof observed === "number" &&
      typeof unobserved === "number" &&
      Math.abs(observed + unobserved - wall) > 0.001
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "observedDurationMs"],
        message:
          "observedDurationMs + unobservedDurationMs must equal wallDurationMs",
      });
    }
  });

export const visionMetricSnapshotSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("VISION_METRIC_SNAPSHOT"),
    kind: z.literal("metric"),
    source: z.literal("VISION_PIPELINE"),
    payload: z
      .object({
        quality: z
          .object({
            usable: z.boolean(),
            state: z.enum([
              "USABLE",
              "DEGRADED_CANDIDATE",
              "UNUSABLE",
              "RECOVERY_CANDIDATE",
            ]),
            confidence: unitScoreSchema,
            components: z
              .object({
                facePresence: unitScoreSchema,
                faceSize: unitScoreSchema,
                inFrame: unitScoreSchema,
                brightness: unitScoreSchema,
                blur: unitScoreSchema,
                poseObservability: unitScoreSchema,
                trackingStability: unitScoreSchema,
              })
              .strict(),
            reasons: z.array(z.enum(FACE_QUALITY_REASONS)),
            pendingReasons: z.array(z.enum(FACE_QUALITY_REASONS)),
            faceDetected: z.boolean(),
            faceCount: z.number().int().nonnegative(),
            faceBoxRatio: unitScoreSchema.nullable(),
            brightnessScore: unitScoreSchema,
            blurScore: unitScoreSchema,
          })
          .strict(),
        metrics: z
          .object({
            smile: z
              .object({
                configurationScore: unitScoreSchema.nullable(),
                baselineScore: unitScoreSchema.nullable(),
                delta: nullableFiniteNumberSchema,
                maintained: z.boolean(),
                promptSuppressedByBaseline: z.boolean(),
                baselinePromptSuppressionThreshold: unitScoreSchema,
                confidence: unitScoreSchema,
              })
              .strict(),
            attention: z
              .object({
                score: z.number().min(0).max(100).nullable(),
                confidence: unitScoreSchema,
                mode: z.string().min(1),
              })
              .strict(),
            activity: z
              .object({
                upperFaceActivityScore: unitScoreSchema.nullable(),
                lowerFaceActivityScore: unitScoreSchema.nullable(),
                poseAlignedLandmarkActivityScore: unitScoreSchema.nullable(),
                expressionActivityScore: unitScoreSchema.nullable(),
                confidence: unitScoreSchema,
                experimentalOnly: z.literal(true),
              })
              .strict(),
            screenFacingScore: unitScoreSchema.nullable(),
            smileScore: unitScoreSchema.nullable(),
            expressionActivityScore: unitScoreSchema.nullable(),
            upperFaceActivityScore: unitScoreSchema.nullable().optional(),
            lowerFaceActivityScore: unitScoreSchema.nullable().optional(),
            poseAlignedLandmarkActivityScore:
              unitScoreSchema.nullable().optional(),
            activityConfidence: unitScoreSchema.nullable().optional(),
            yawDelta: nullableFiniteNumberSchema,
            pitchDelta: nullableFiniteNumberSchema,
            rollDelta: nullableFiniteNumberSchema,
            eyeGazeScore: unitScoreSchema.nullable().optional(),
            gazeHorizontalDelta: nullableFiniteNumberSchema.optional(),
            gazeVerticalDelta: nullableFiniteNumberSchema.optional(),
            smileConfigurationScore: unitScoreSchema.nullable().optional(),
            baselineSmileScore: unitScoreSchema.nullable().optional(),
            smileDelta: nullableFiniteNumberSchema.optional(),
            mouthAsymmetry: unitScoreSchema.nullable().optional(),
            maintainedSmileConfiguration: z.boolean().optional(),
            headPoseScore: unitScoreSchema.nullable().optional(),
            faceCenterScore: unitScoreSchema.nullable().optional(),
            irisProxyScore: unitScoreSchema.nullable().optional(),
            screenAttentionScore: z.number().min(0).max(100).nullable().optional(),
            screenAttentionConfidence: unitScoreSchema.nullable().optional(),
            gazeReliability: unitScoreSchema.nullable().optional(),
            binocularAgreement: unitScoreSchema.nullable().optional(),
            gazeMode: z.string().nullable().optional(),
            attentionMode: z.string().nullable().optional(),
            attentionEvidenceMode: z.string().nullable().optional(),
          })
          .strict(),
        performance: z
          .object({
            profile: z.enum(PERFORMANCE_PROFILES),
            targetFps: z.number().positive(),
            actualFps: z.number().nonnegative(),
            meanProcessingMs: z.number().nonnegative(),
            droppedFramesSinceLastSnapshot: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.payload.quality.usable && snapshot.payload.quality.reasons.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["payload", "quality", "reasons"],
        message: "usable snapshots cannot contain quality failure reasons",
      });
    }

    if (!snapshot.payload.quality.faceDetected && snapshot.payload.quality.faceBoxRatio !== null) {
      context.addIssue({
        code: "custom",
        path: ["payload", "quality", "faceBoxRatio"],
        message: "faceBoxRatio must be null when no face is detected",
      });
    }
  });

export const visionEventSchema = z.union([
  visionBehaviorEventSchema,
  visionMetricSnapshotSchema,
]);
