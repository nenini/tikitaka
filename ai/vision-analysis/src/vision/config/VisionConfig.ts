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
    schemaVersion: z.literal(2),
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
    behaviorPolicy: z
      .object({
        suspensionGraceMs: z.number().int().positive(),
        recoveryWarmupMs: z.number().int().nonnegative(),
      })
      .strict(),
    calibration: z
      .object({
        setupRecommendedDurationMs: z.number().int().positive(),
        stabilizationDurationMs: z.number().int().positive(),
        stabilizationMinimumFrames: z.number().int().positive(),
        recoveryWarmupMs: z.number().int().positive(),
        minimumUsableDurationMs: z.number().int().positive(),
        targetUsableDurationMs: z.number().int().positive(),
        maximumWallDurationMs: z.number().int().positive(),
        minimumUsableFrames: z.number().int().positive(),
        partialMinimumUsableFrames: z.number().int().positive(),
        readyMinimumConfidence: unitScoreSchema,
        partialMinimumConfidence: unitScoreSchema,
        priorShrinkageSampleCount: z.number().positive(),
        targetFps: z.number().positive(),
        minimumPreferredFps: z.number().positive(),
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
        if (calibration.partialMinimumUsableFrames >= calibration.minimumUsableFrames) {
          context.addIssue({
            code: "custom",
            path: ["partialMinimumUsableFrames"],
            message: "partial frame count must be lower than ready frame count",
          });
        }
      }),
    adaptiveBaseline: z
      .object({
        windowMs: z.number().int().positive(),
        startEligibleRatio: unitScoreSchema,
        maintainEligibleRatio: unitScoreSchema,
        minimumObservableMs: z.number().int().positive(),
        longGapMs: z.number().int().positive(),
        recoveryWarmupMs: z.number().int().positive(),
        poseHalfLifeMs: z.number().positive(),
        geometryHalfLifeMs: z.number().positive(),
        gazeHalfLifeMs: z.number().positive(),
        maximumPoseDriftDegrees: z.number().positive(),
        maximumCenterDrift: unitScoreSchema,
        maximumAreaDrift: unitScoreSchema,
        maximumGazeDrift: unitScoreSchema,
        reanchorMinimumStableMs: z.number().int().positive(),
        reanchorMinimumSamples: z.number().int().positive(),
      })
      .strict()
      .superRefine((adaptive, context) => {
        if (adaptive.maintainEligibleRatio >= adaptive.startEligibleRatio) {
          context.addIssue({
            code: "custom",
            path: ["maintainEligibleRatio"],
            message: "maintain ratio must be lower than start ratio",
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
        faceAreaMaximum: z
          .object({
            entry: unitScoreSchema,
            recovery: unitScoreSchema,
            entryDurationMs: durationSchema,
            recoveryDurationMs: durationSchema,
          })
          .strict()
          .superRefine((gate, context) => {
            if (gate.recovery >= gate.entry) {
              context.addIssue({
                code: "custom",
                path: ["recovery"],
                message: "maximum face-area recovery must be lower than entry",
              });
            }
          }),
        faceInFrame: lowerIsWorseGateSchema,
        brightness: lowerIsWorseGateSchema,
        backlight: lowerIsWorseGateSchema,
        blur: lowerIsWorseGateSchema,
        extremeYaw: higherIsWorseAngleGateSchema,
        extremePitch: higherIsWorseAngleGateSchema,
        extremeRoll: higherIsWorseAngleGateSchema,
        analysisRecoveryWarmupMs: durationSchema,
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
        blinkEntryScore: unitScoreSchema,
        blinkRecoveryScore: unitScoreSchema,
        blinkRecoveryWarmupMs: durationSchema,
        minimumBinocularAgreementScore: unitScoreSchema,
        binocularHorizontalTolerance: z.number().positive().max(1),
        binocularVerticalTolerance: z.number().positive().max(1),
        headWeight: unitScoreSchema,
        faceCenterWeight: unitScoreSchema,
        irisWeight: unitScoreSchema,
        headOnlyWeight: unitScoreSchema,
        centerOnlyWeight: unitScoreSchema,
        attentionAwayScore: z.number().min(0).max(100),
        attentionRecoveryScore: z.number().min(0).max(100),
        minimumEventConfidence: unitScoreSchema,
        minimumRecoveryConfidence: unitScoreSchema,
        minimumAwayObservations: z.number().int().positive(),
        minimumRecoveryObservations: z.number().int().positive(),
        irisOnlyScore: z.number().min(0).max(100),
        irisOnlyMinimumReliability: unitScoreSchema,
        irisOnlyMinimumConfidence: unitScoreSchema,
        irisOnlyMinimumDurationMs: durationSchema,
        irisOnlyMinimumObservations: z.number().int().positive(),
        suspendedConfidenceThreshold: unitScoreSchema,
        fallbackYawDegrees: z.number().positive(),
        fallbackPitchDegrees: z.number().positive(),
        fallbackMinimumDurationMs: durationSchema,
        fallbackMinimumMeasurementConfidence: unitScoreSchema,
        awayMinimumDurationMs: z.number().int().positive(),
        recoveryMinimumDurationMs: z.number().int().positive(),
        prolongedDurationMs: z.number().int().positive(),
        cooldownMs: durationSchema,
        emaAlpha: z.number().positive().max(1),
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
        /** Personalized baselines at or above this level suppress smile prompts. */
        baselinePromptSuppressionScore: unitScoreSchema,
        subtleAbsoluteScore: unitScoreSchema,
        smileAbsoluteScore: unitScoreSchema,
        strongAbsoluteScore: unitScoreSchema,
        subtleDelta: unitScoreSchema,
        smileDelta: unitScoreSchema,
        strongDelta: unitScoreSchema,
        subtleRecoveryAbsoluteScore: unitScoreSchema,
        smileRecoveryAbsoluteScore: unitScoreSchema,
        strongRecoveryAbsoluteScore: unitScoreSchema,
        subtleRecoveryDelta: unitScoreSchema,
        smileRecoveryDelta: unitScoreSchema,
        strongRecoveryDelta: unitScoreSchema,
        smileMinimumDurationMs: z.number().int().positive(),
        smileRecoveryDurationMs: z.number().int().positive(),
        smileMergeGapMs: z.number().int().positive(),
        smileMinimumObservations: z.number().int().positive(),
        strongMinimumDurationMs: z.number().int().positive(),
        strongMinimumObservations: z.number().int().positive(),
        maximumFrameGapMs: z.number().int().positive(),
        maintainedDurationMs: z.number().int().positive(),
        minimumMeasurementConfidence: unitScoreSchema,
        asymmetryConfidenceStart: unitScoreSchema,
        asymmetryHigh: unitScoreSchema,
        asymmetryHold: unitScoreSchema,
        fallbackMaximumAsymmetry: unitScoreSchema,
        fallbackMinimumSideScore: unitScoreSchema,
        fallbackMinimumDurationMs: z.number().int().positive(),
        fallbackMinimumObservations: z.number().int().positive(),
        fallbackMinimumMeasurementConfidence: unitScoreSchema,
        emaHalfLifeMs: z.number().positive(),
      })
      .strict()
      .superRefine((smile, context) => {
        if (
          smile.baselinePromptSuppressionScore >
          smile.subtleAbsoluteScore
        ) {
          context.addIssue({
            code: "custom",
            path: ["baselinePromptSuppressionScore"],
            message:
              "baseline prompt suppression must not exceed the subtle smile threshold",
          });
        }
        if (
          !(
            smile.subtleAbsoluteScore < smile.smileAbsoluteScore &&
            smile.smileAbsoluteScore < smile.strongAbsoluteScore
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["smileAbsoluteScore"],
            message: "absolute smile thresholds must be strictly increasing",
          });
        }

        if (
          !(
            smile.subtleDelta < smile.smileDelta &&
            smile.smileDelta < smile.strongDelta
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["smileDelta"],
            message: "smile delta thresholds must be strictly increasing",
          });
        }
      }),
    expressionActivity: z
      .object({
        upperFaceBlendshapeNames: z.array(z.string().min(1)).min(1),
        lowerFaceBlendshapeNames: z.array(z.string().min(1)).min(1),
        blendshapeWeight: unitScoreSchema,
        landmarkWeight: unitScoreSchema,
        maximumFrameGapMs: z.number().int().positive(),
        rateNormalizationPerSecond: z.number().positive(),
        emitBehaviorEvents: z.literal(false),
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
