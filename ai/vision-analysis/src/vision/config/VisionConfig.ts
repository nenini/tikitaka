import { z } from "zod";

const unitScoreSchema = z.number().min(0).max(1);
const durationSchema = z.number().int().nonnegative();

export const DETECTOR_NAMES = [
  "FACE_QUALITY",
  "SCREEN_ATTENTION",
  "SMILE_EXPRESSION",
  "EXPRESSION_ACTIVITY",
  "NOD",
] as const;

export type DetectorName = (typeof DETECTOR_NAMES)[number];

const performanceProfileSchema = z
  .object({
    targetFps: z.number().positive().max(30),
    enabledDetectors: z.array(z.enum(DETECTOR_NAMES)).min(1),
  })
  .strict()
  .superRefine((profile, context) => {
    if (!profile.enabledDetectors.includes("FACE_QUALITY")) {
      context.addIssue({
        code: "custom",
        path: ["enabledDetectors"],
        message: "FACE_QUALITY must be enabled in every performance profile",
      });
    }
  });

const lowerIsWorseGateSchema = z
  .object({
    entry: unitScoreSchema,
    recovery: unitScoreSchema,
    entryDurationMs: durationSchema,
    recoveryDurationMs: durationSchema,
  })
  .strict()
  .superRefine((gate, context) => {
    if (gate.recovery <= gate.entry) {
      context.addIssue({
        code: "custom",
        path: ["recovery"],
        message: "recovery must be greater than entry",
      });
    }
  });

const higherIsWorseAngleGateSchema = z
  .object({
    entryDegrees: z.number().positive().max(180),
    recoveryDegrees: z.number().nonnegative().max(180),
    entryDurationMs: durationSchema,
    recoveryDurationMs: durationSchema,
  })
  .strict()
  .superRefine((gate, context) => {
    if (gate.recoveryDegrees >= gate.entryDegrees) {
      context.addIssue({
        code: "custom",
        path: ["recoveryDegrees"],
        message: "recoveryDegrees must be lower than entryDegrees",
      });
    }
  });

export const visionConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    model: z
      .object({
        wasmBasePath: z.string().min(1),
        modelAssetPath: z.string().min(1),
        modelVersion: z.string().min(1).max(128),
        ruleVersion: z.string().min(1).max(128),
        numFaces: z.number().int().min(2).max(4),
        minFaceDetectionConfidence: unitScoreSchema,
        minFacePresenceConfidence: unitScoreSchema,
        minTrackingConfidence: unitScoreSchema,
        outputFaceBlendshapes: z.literal(true),
        outputFacialTransformationMatrixes: z.literal(true),
        preferredDelegate: z.enum(["GPU", "CPU"]),
      })
      .strict(),
    frame: z
      .object({
        analysisWidth: z.number().int().positive().max(1920),
        analysisHeight: z.number().int().positive().max(1080),
        maxInFlightFrames: z.literal(1),
        faceRoiPaddingRatio: unitScoreSchema,
        blurVarianceFloor: z.number().nonnegative(),
        blurVarianceCeiling: z.number().positive(),
      })
      .strict()
      .superRefine((frame, context) => {
        if (frame.blurVarianceCeiling <= frame.blurVarianceFloor) {
          context.addIssue({
            code: "custom",
            path: ["blurVarianceCeiling"],
            message: "blur variance ceiling must exceed the floor",
          });
        }
      }),
    worker: z
      .object({
        initializationTimeoutMs: z.number().int().positive(),
        maximumRestartAttempts: z.number().int().nonnegative().max(3),
      })
      .strict(),
    profiles: z
      .object({
        HIGH: performanceProfileSchema,
        MEDIUM: performanceProfileSchema,
        LOW: performanceProfileSchema,
      })
      .strict(),
    performanceGovernor: z
      .object({
        overloadWindowMs: z.number().int().positive(),
        recoveryWindowMs: z.number().int().positive(),
        profileChangeCooldownMs: z.number().int().positive(),
        maxProcessingBudgetRatio: z.number().positive().max(1),
        nodMinimumActualFps: z.number().positive(),
      })
      .strict(),
    calibration: z
      .object({
        minimumUsableDurationMs: z.number().int().positive(),
        targetUsableDurationMs: z.number().int().positive(),
        maximumWallDurationMs: z.number().int().positive(),
        minimumUsableFrames: z.number().int().positive(),
        activityBaselineDurationMs: z.number().int().positive(),
        trimRatio: z.number().nonnegative().max(0.25),
        minimumInFrameRatio: unitScoreSchema,
        maximumAbsoluteYawDegrees: z.number().positive(),
        maximumAbsolutePitchDegrees: z.number().positive(),
        maximumAbsoluteRollDegrees: z.number().positive(),
      })
      .strict()
      .superRefine((calibration, context) => {
        if (
          calibration.targetUsableDurationMs <
          calibration.minimumUsableDurationMs
        ) {
          context.addIssue({
            code: "custom",
            path: ["targetUsableDurationMs"],
            message: "target duration cannot be shorter than minimum duration",
          });
        }

        if (
          calibration.maximumWallDurationMs <
          calibration.targetUsableDurationMs
        ) {
          context.addIssue({
            code: "custom",
            path: ["maximumWallDurationMs"],
            message: "maximum wall duration cannot be shorter than target duration",
          });
        }
      }),
    quality: z
      .object({
        faceMissingEntryDurationMs: durationSchema,
        faceMissingRecoveryDurationMs: durationSchema,
        multipleFacesEntryDurationMs: durationSchema,
        multipleFacesRecoveryDurationMs: durationSchema,
        faceArea: lowerIsWorseGateSchema,
        faceInFrame: lowerIsWorseGateSchema,
        brightness: lowerIsWorseGateSchema,
        blur: lowerIsWorseGateSchema,
        extremeYaw: higherIsWorseAngleGateSchema,
        extremePitch: higherIsWorseAngleGateSchema,
        extremeRoll: higherIsWorseAngleGateSchema,
        analysisRecoveryWarmupMs: durationSchema,
        defaultEventConfidence: unitScoreSchema,
      })
      .strict(),
    screenAttention: z
      .object({
        yawEntryDegrees: z.number().positive(),
        yawRecoveryDegrees: z.number().nonnegative(),
        pitchEntryDegrees: z.number().positive(),
        pitchRecoveryDegrees: z.number().nonnegative(),
        centerXEntryDelta: unitScoreSchema,
        centerXRecoveryDelta: unitScoreSchema,
        centerYEntryDelta: unitScoreSchema,
        centerYRecoveryDelta: unitScoreSchema,
        gazeHorizontalEntryDelta: unitScoreSchema,
        gazeHorizontalRecoveryDelta: unitScoreSchema,
        gazeVerticalEntryDelta: unitScoreSchema,
        gazeVerticalRecoveryDelta: unitScoreSchema,
        maximumEyeBlinkScore: unitScoreSchema,
        minimumBinocularAgreementScore: unitScoreSchema,
        awayMinimumDurationMs: z.number().int().positive(),
        recoveryMinimumDurationMs: z.number().int().positive(),
        prolongedDurationMs: z.number().int().positive(),
        cooldownMs: durationSchema,
        emaAlpha: z.number().positive().max(1),
        defaultEventConfidence: unitScoreSchema,
      })
      .strict()
      .superRefine((attention, context) => {
        const comparisons: readonly [number, number, string][] = [
          [attention.yawEntryDegrees, attention.yawRecoveryDegrees, "yawRecoveryDegrees"],
          [attention.pitchEntryDegrees, attention.pitchRecoveryDegrees, "pitchRecoveryDegrees"],
          [attention.centerXEntryDelta, attention.centerXRecoveryDelta, "centerXRecoveryDelta"],
          [attention.centerYEntryDelta, attention.centerYRecoveryDelta, "centerYRecoveryDelta"],
          [attention.gazeHorizontalEntryDelta, attention.gazeHorizontalRecoveryDelta, "gazeHorizontalRecoveryDelta"],
          [attention.gazeVerticalEntryDelta, attention.gazeVerticalRecoveryDelta, "gazeVerticalRecoveryDelta"],
        ];

        for (const [entry, recovery, path] of comparisons) {
          if (recovery >= entry) {
            context.addIssue({
              code: "custom",
              path: [path],
              message: "recovery threshold must be lower than entry threshold",
            });
          }
        }

        if (attention.prolongedDurationMs <= attention.awayMinimumDurationMs) {
          context.addIssue({
            code: "custom",
            path: ["prolongedDurationMs"],
            message: "prolonged duration must exceed initial away duration",
          });
        }
      }),
    smile: z
      .object({
        smileWeight: unitScoreSchema,
        cheekWeight: unitScoreSchema,
        entryAbsoluteScore: unitScoreSchema,
        entryBaselineDelta: unitScoreSchema,
        recoveryBaselineDelta: unitScoreSchema,
        minimumDurationMs: z.number().int().positive(),
        recoveryDurationMs: z.number().int().positive(),
        mergeGapMs: z.number().int().positive(),
        emaAlpha: z.number().positive().max(1),
        defaultEventConfidence: unitScoreSchema,
      })
      .strict()
      .superRefine((smile, context) => {
        if (Math.abs(smile.smileWeight + smile.cheekWeight - 1) > 0.000001) {
          context.addIssue({
            code: "custom",
            path: ["cheekWeight"],
            message: "smile and cheek weights must sum to 1",
          });
        }

        if (smile.recoveryBaselineDelta >= smile.entryBaselineDelta) {
          context.addIssue({
            code: "custom",
            path: ["recoveryBaselineDelta"],
            message: "recovery delta must be lower than entry delta",
          });
        }
      }),
    expressionActivity: z
      .object({
        blendshapeNames: z.array(z.string().min(1)).min(1),
        blendshapeWeight: unitScoreSchema,
        landmarkWeight: unitScoreSchema,
        windowMs: z.number().int().positive(),
        warmupMs: z.number().int().positive(),
        minimumWindowSamples: z.number().int().positive(),
        lowMinimumDurationMs: z.number().int().positive(),
        recoveryMinimumDurationMs: z.number().int().positive(),
        fallbackLowThreshold: unitScoreSchema,
        fallbackRecoveryThreshold: unitScoreSchema,
        baselineLowRatio: z.number().positive().max(1),
        baselineRecoveryRatio: z.number().positive(),
        emaAlpha: z.number().positive().max(1),
        defaultEventConfidence: unitScoreSchema,
      })
      .strict()
      .superRefine((activity, context) => {
        if (
          Math.abs(
            activity.blendshapeWeight + activity.landmarkWeight - 1,
          ) > 0.000001
        ) {
          context.addIssue({
            code: "custom",
            path: ["landmarkWeight"],
            message: "activity weights must sum to 1",
          });
        }

        if (
          activity.fallbackRecoveryThreshold <=
          activity.fallbackLowThreshold
        ) {
          context.addIssue({
            code: "custom",
            path: ["fallbackRecoveryThreshold"],
            message: "recovery threshold must exceed the low threshold",
          });
        }

        if (activity.baselineRecoveryRatio <= activity.baselineLowRatio) {
          context.addIssue({
            code: "custom",
            path: ["baselineRecoveryRatio"],
            message: "baseline recovery ratio must exceed the low ratio",
          });
        }

        if (activity.warmupMs > activity.windowMs) {
          context.addIssue({
            code: "custom",
            path: ["warmupMs"],
            message: "warmup cannot exceed the rolling window duration",
          });
        }
      }),
    nod: z
      .object({
        enabledByDefault: z.boolean(),
        downwardPitchSign: z.union([z.literal(-1), z.literal(1)]),
        minimumAmplitudeDegrees: z.number().positive(),
        maximumAmplitudeDegrees: z.number().positive(),
        returnToleranceDegrees: z.number().positive(),
        minimumReversalDegrees: z.number().positive(),
        minimumDownstrokeMs: z.number().int().positive(),
        minimumUpstrokeMs: z.number().int().positive(),
        maximumDownHoldMs: z.number().int().positive(),
        minimumDurationMs: z.number().int().positive(),
        maximumDurationMs: z.number().int().positive(),
        cooldownMs: z.number().int().positive(),
        emaAlpha: z.number().positive().max(1),
        defaultEventConfidence: unitScoreSchema,
      })
      .strict()
      .superRefine((nod, context) => {
        if (nod.maximumAmplitudeDegrees <= nod.minimumAmplitudeDegrees) {
          context.addIssue({
            code: "custom",
            path: ["maximumAmplitudeDegrees"],
            message: "maximum amplitude must exceed minimum amplitude",
          });
        }

        if (nod.maximumDurationMs <= nod.minimumDurationMs) {
          context.addIssue({
            code: "custom",
            path: ["maximumDurationMs"],
            message: "maximum duration must exceed minimum duration",
          });
        }


        if (nod.maximumDownHoldMs >= nod.maximumDurationMs) {
          context.addIssue({
            code: "custom",
            path: ["maximumDownHoldMs"],
            message: "maximum down hold must be shorter than maximum duration",
          });
        }
      }),
    events: z
      .object({
        metricSnapshotIntervalMs: z.number().int().min(1_000),
      })
      .strict(),
    transport: z
      .object({
        batchIntervalMs: z.number().int().min(0).max(1_000),
        maxBufferedEvents: z.number().int().positive(),
        maxBufferedAgeMs: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export type VisionConfig = z.infer<typeof visionConfigSchema>;
