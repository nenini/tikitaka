import { describe, expect, it } from "vitest";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { ScreenAttentionDetector } from "../../src/vision/detectors/ScreenAttentionDetector.js";
import { createDetectorEventFactory } from "../helpers/createDetectorTestKit.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";
import { createVisionBaseline } from "../helpers/createVisionBaseline.js";

const baseline = createVisionBaseline();
const quality = { usable: true, confidence: 0.9, reasons: [] } as const;

describe("ScreenAttentionDetector", () => {
  it("uses configured pose, center, and gaze thresholds in component scores", () => {
    const strictDetector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const lenientDetector = new ScreenAttentionDetector(
      {
        ...defaultVisionConfig.screenAttention,
        emaAlpha: 1,
        yawRecoveryDegrees: 17,
        yawEntryDegrees: 30,
        pitchRecoveryDegrees: 13,
        pitchEntryDegrees: 25,
        centerXRecoveryDelta: 0.16,
        centerXEntryDelta: 0.3,
        centerYRecoveryDelta: 0.13,
        centerYEntryDelta: 0.25,
        gazeHorizontalRecoveryDelta: 0.16,
        gazeHorizontalEntryDelta: 0.3,
        gazeVerticalRecoveryDelta: 0.16,
        gazeVerticalEntryDelta: 0.3,
      },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    const frame = createNormalizedFaceFrame({
      yaw: 16,
      pitch: 12,
      centerX: 0.65,
      centerY: 0.62,
      eyeGaze: {
        left: { horizontalRatio: 0.65, verticalRatio: 0.65 },
        right: { horizontalRatio: 0.65, verticalRatio: 0.65 },
        horizontalRatio: 0.65,
        verticalRatio: 0.65,
        binocularAgreementScore: 1,
      },
      blendshapes: { eyeBlinkLeft: 0, eyeBlinkRight: 0 },
    });

    strictDetector.update(frame, context);
    lenientDetector.update(frame, context);

    expect(lenientDetector.getState().headPoseScore ?? 0).toBeGreaterThan(
      strictDetector.getState().headPoseScore ?? 0,
    );
    expect(lenientDetector.getState().faceCenterScore ?? 0).toBeGreaterThan(
      strictDetector.getState().faceCenterScore ?? 0,
    );
    expect(lenientDetector.getState().irisProxyScore ?? 0).toBeGreaterThan(
      strictDetector.getState().irisProxyScore ?? 0,
    );
  });

  it("ignores a brief turn and emits one start/end for a sustained turn", () => {
    const detector = new ScreenAttentionDetector({ ...defaultVisionConfig.screenAttention, emaAlpha: 1 }, createDetectorEventFactory());
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 0, yaw: 25, pitch: 20 }), context)).toHaveLength(0);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 1_000, yaw: 0 }), context)).toHaveLength(0);
    detector.update(createNormalizedFaceFrame({ timestampMs: 2_000, yaw: 25, pitch: 20 }), context);
    detector.update(createNormalizedFaceFrame({ timestampMs: 2_500, yaw: 25, pitch: 20 }), context);
    detector.update(createNormalizedFaceFrame({ timestampMs: 3_000, yaw: 25, pitch: 20 }), context);
    const started = detector.update(createNormalizedFaceFrame({ timestampMs: 3_500, yaw: 25, pitch: 20 }), context);
    expect(started.map((event) => event.eventType)).toEqual(["GAZE_AWAY_STARTED"]);
    detector.update(createNormalizedFaceFrame({ timestampMs: 4_000, yaw: 0 }), context);
    const ended = detector.update(createNormalizedFaceFrame({ timestampMs: 4_500, yaw: 0 }), context);
    expect(ended.map((event) => event.eventType)).toEqual(["GAZE_AWAY_ENDED"]);
  });

  it("can enter from a low aggregate score with one meaningful signal", () => {
    const detector = new ScreenAttentionDetector(
      {
        ...defaultVisionConfig.screenAttention,
        emaAlpha: 1,
        attentionAwayScore: 80,
        awayMinimumDurationMs: 1_000,
        minimumAwayObservations: 3,
      },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    const events = [0, 500, 1_000, 1_500].flatMap((timestampMs) =>
      detector.update(
        createNormalizedFaceFrame({
          timestampMs,
          yaw: 25,
          pitch: 0,
          blendshapes: { eyeBlinkLeft: 0, eyeBlinkRight: 0 },
        }),
        context,
      ),
    );

    expect(detector.getState().entryBlockReason).toBe("NONE");
    expect(events.map((event) => event.eventType)).toContain(
      "GAZE_AWAY_STARTED",
    );
    expect(detector.getState().entryBlockReason).toBe("NONE");
  });

  it("uses reliable iris displacement as an additional attention signal", () => {
    const detector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    const shiftedGaze = {
      left: { horizontalRatio: 0.8, verticalRatio: 0.8 },
      right: { horizontalRatio: 0.8, verticalRatio: 0.8 },
      horizontalRatio: 0.8,
      verticalRatio: 0.8,
      binocularAgreementScore: 1,
    } as const;

    const openEyes = { eyeBlinkLeft: 0, eyeBlinkRight: 0 };
    let started: ReturnType<typeof detector.update> = [];
    for (const timestampMs of [0, 500, 1_000, 1_500, 2_000]) {
      started = detector.update(
        createNormalizedFaceFrame({
          timestampMs,
          eyeGaze: shiftedGaze,
          blendshapes: openEyes,
        }),
        context,
      );
    }

    expect(started[0]?.eventType).toBe("GAZE_AWAY_STARTED");
    expect(detector.getState().eyeGazeScore).toBe(0);
  });

  it("removes iris weight when the two eyes disagree", () => {
    const detector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    detector.update(
      createNormalizedFaceFrame({
        yaw: 16,
        eyeGaze: {
          left: { horizontalRatio: 0.8, verticalRatio: 0.5 },
          right: { horizontalRatio: 0.2, verticalRatio: 0.5 },
          horizontalRatio: 0.5,
          verticalRatio: 0.5,
          binocularAgreementScore: 0.4,
        },
        blendshapes: { eyeBlinkLeft: 0, eyeBlinkRight: 0 },
      }),
      context,
    );

    const state = detector.getState();
    expect(state.binocularAgreement).toBe(0);
    expect(state.irisProxyScore).toBe(1);
    expect(state.effectiveIrisWeight).toBe(0);
    expect(state.attentionMode).toBe("HEAD_CENTER_ONLY");
    expect(state.screenAttentionScore).toBeCloseTo(
      100 *
        (defaultVisionConfig.screenAttention.headOnlyWeight *
          (state.headPoseScore ?? 0) +
          defaultVisionConfig.screenAttention.centerOnlyWeight *
            (state.faceCenterScore ?? 0)),
    );
  });

  it("scales iris weight by reliability and applies one monocular penalty", () => {
    const binocular = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    binocular.update(
      createNormalizedFaceFrame({
        eyeGaze: {
          left: { horizontalRatio: 0.65, verticalRatio: 0.5 },
          right: { horizontalRatio: 0.65, verticalRatio: 0.5 },
          horizontalRatio: 0.65,
          verticalRatio: 0.5,
          binocularAgreementScore: 1,
        },
        blendshapes: { eyeBlinkLeft: 0, eyeBlinkRight: 0 },
      }),
      context,
    );
    expect(binocular.getState().gazeReliability).toBeCloseTo(0.9);
    expect(binocular.getState().effectiveIrisWeight).toBeCloseTo(
      defaultVisionConfig.screenAttention.irisWeight * 0.9,
    );

    const monocular = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    monocular.update(
      createNormalizedFaceFrame({
        blendshapes: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0 },
      }),
      context,
    );
    expect(monocular.getState().gazeReliability).toBeCloseTo(0.9 * 0.85);
  });

  it("does not treat a blink as gaze departure", () => {
    const detector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    const shiftedGaze = {
      left: { horizontalRatio: 0.8, verticalRatio: 0.5 },
      right: { horizontalRatio: 0.8, verticalRatio: 0.5 },
      horizontalRatio: 0.8,
      verticalRatio: 0.5,
      binocularAgreementScore: 1,
    } as const;
    const blink = { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 };

    const events = [0, 1_500].flatMap((timestampMs) =>
      detector.update(
        createNormalizedFaceFrame({
          timestampMs,
          eyeGaze: shiftedGaze,
          blendshapes: blink,
        }),
        context,
      ),
    );

    expect(events).toHaveLength(0);
    expect(detector.getState().eyeGazeScore).toBeNull();
  });

  it("keeps face-center-only movement metric-only", () => {
    const detector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    const events = [0, 500, 1_000, 1_500, 2_000].flatMap((timestampMs) =>
      detector.update(
        createNormalizedFaceFrame({
          timestampMs,
          centerX: 0.8,
          blendshapes: { eyeBlinkLeft: 0, eyeBlinkRight: 0 },
        }),
        context,
      ),
    );
    expect(events).toHaveLength(0);
    expect(detector.getState().faceCenterScore).toBeLessThan(1);
    expect(detector.getState().attentionEvidenceMode).toBe("ALIGNED");
  });

  it("uses the unblinked eye in monocular mode", () => {
    const detector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const context = { quality, baseline, performanceProfile: "HIGH" as const };
    detector.update(
      createNormalizedFaceFrame({
        timestampMs: 0,
        blendshapes: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0 },
      }),
      context,
    );
    expect(detector.getState().gazeMode).toBe("MONOCULAR_RIGHT");
    expect(detector.getState().leftEyeReliability).toBe(0);
    expect(detector.getState().rightEyeReliability).toBeGreaterThan(0);
  });

  it("blocks low-confidence departure candidates", () => {
    const detector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const lowQuality = {
      usable: true,
      confidence: 0.2,
      reasons: [],
    } as const;
    const context = {
      quality: lowQuality,
      baseline,
      performanceProfile: "HIGH" as const,
    };
    const events = [0, 500, 1_000, 1_500, 2_000].flatMap((timestampMs) =>
      detector.update(
        createNormalizedFaceFrame({ timestampMs, yaw: 25, pitch: 20 }),
        context,
      ),
    );
    expect(events).toHaveLength(0);
    expect(detector.getState().state).toBe("SUSPENDED");
  });

  it("uses only strong pose evidence in global fallback", () => {
    const detector = new ScreenAttentionDetector(
      { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
      createDetectorEventFactory(),
    );
    const fallback = createVisionBaseline({
      status: "GLOBAL_FALLBACK",
    });
    const context = {
      quality,
      baseline: fallback,
      performanceProfile: "HIGH" as const,
    };
    const moderate = [0, 1_000, 2_000].flatMap((timestampMs) =>
      detector.update(
        createNormalizedFaceFrame({ timestampMs, yaw: 30 }),
        context,
      ),
    );
    expect(moderate).toHaveLength(0);

    detector.reset();
    const strong = [3_000, 3_500, 4_000, 4_500, 5_000].flatMap(
      (timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({ timestampMs, yaw: 45 }),
          context,
        ),
    );
    expect(strong.map((event) => event.eventType)).toContain(
      "GAZE_AWAY_STARTED",
    );
    expect(detector.getState().coachingEligible).toBe(false);
  });

  describe("iris-only departures cannot bypass the strict path", () => {
    const openEyes = { eyeBlinkLeft: 0, eyeBlinkRight: 0 } as const;
    const shiftedGaze = {
      left: { horizontalRatio: 0.8, verticalRatio: 0.8 },
      right: { horizontalRatio: 0.8, verticalRatio: 0.8 },
      horizontalRatio: 0.8,
      verticalRatio: 0.8,
      binocularAgreementScore: 1,
    } as const;

    function createDetector(): ScreenAttentionDetector {
      return new ScreenAttentionDetector(
        { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
        createDetectorEventFactory(),
      );
    }

    it("emits nothing when the eye baseline reliability is below the evidence floor", () => {
      const detector = createDetector();
      const context = {
        quality,
        baseline: createVisionBaseline({
          leftEyeBaselineConfidence: 0.2,
          rightEyeBaselineConfidence: 0.2,
        }),
        performanceProfile: "HIGH" as const,
      };
      const events = [0, 500, 1_000, 1_500, 2_000, 2_500].flatMap(
        (timestampMs) =>
          detector.update(
            createNormalizedFaceFrame({
              timestampMs,
              eyeGaze: shiftedGaze,
              blendshapes: openEyes,
            }),
            context,
          ),
      );

      expect(events).toHaveLength(0);
      expect(detector.getState().entryBlockReason).toBe(
        "NO_MEANINGFUL_HEAD_OR_IRIS_CHANGE",
      );
    });

    it("blocks a mid-range iris-only departure that used to leak through the aggregate rule", () => {
      // gaze 0.655 -> irisProxyScore 0.36 (departure, but above irisOnlyScore)
      // and aggregate score 71 (<= attentionAwayScore) with confidence 0.91.
      // The old `headDeparture || irisDeparture` rule fired here in 1s.
      const midGaze = {
        left: { horizontalRatio: 0.655, verticalRatio: 0.655 },
        right: { horizontalRatio: 0.655, verticalRatio: 0.655 },
        horizontalRatio: 0.655,
        verticalRatio: 0.655,
        binocularAgreementScore: 1,
      } as const;
      const detector = createDetector();
      const context = { quality, baseline, performanceProfile: "HIGH" as const };
      const events = [0, 500, 1_000, 1_500, 2_000, 2_500, 3_000].flatMap(
        (timestampMs) =>
          detector.update(
            createNormalizedFaceFrame({
              timestampMs,
              eyeGaze: midGaze,
              blendshapes: openEyes,
            }),
            context,
          ),
      );

      expect(events).toHaveLength(0);
      expect(detector.getState().attentionEvidenceMode).toBe(
        "IRIS_ONLY_DEPARTURE",
      );
      expect(detector.getState().entryBlockReason).toBe(
        "IRIS_SCORE_ABOVE_THRESHOLD",
      );
    });

    it("reports the reliability gate when the iris clears the evidence floor but not the entry threshold", () => {
      const detector = createDetector();
      const context = {
        quality,
        baseline: createVisionBaseline({
          leftEyeBaselineConfidence: 0.5,
          rightEyeBaselineConfidence: 0.5,
        }),
        performanceProfile: "HIGH" as const,
      };
      const events = [0, 500, 1_000, 1_500, 2_000, 2_500].flatMap(
        (timestampMs) =>
          detector.update(
            createNormalizedFaceFrame({
              timestampMs,
              eyeGaze: shiftedGaze,
              blendshapes: openEyes,
            }),
            context,
          ),
      );

      expect(events).toHaveLength(0);
      expect(detector.getState().entryBlockReason).toBe(
        "IRIS_RELIABILITY_TOO_LOW",
      );
    });

    it("still needs the full 2s iris-only path when every iris gate is satisfied", () => {
      const detector = createDetector();
      const context = { quality, baseline, performanceProfile: "HIGH" as const };
      const before = [0, 500, 1_000, 1_500].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({
            timestampMs,
            eyeGaze: shiftedGaze,
            blendshapes: openEyes,
          }),
          context,
        ),
      );
      expect(before).toHaveLength(0);

      const after = detector.update(
        createNormalizedFaceFrame({
          timestampMs: 2_000,
          eyeGaze: shiftedGaze,
          blendshapes: openEyes,
        }),
        context,
      );
      expect(after.map((event) => event.eventType)).toContain(
        "GAZE_AWAY_STARTED",
      );
      expect(detector.getState().attentionEvidenceMode).toBe(
        "IRIS_ONLY_DEPARTURE",
      );
    });

    it("keeps the 1s aggregate path for a head departure", () => {
      const detector = createDetector();
      const context = { quality, baseline, performanceProfile: "HIGH" as const };
      const events = [0, 300, 600, 1_000].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({
            timestampMs,
            yaw: 30,
            pitch: 22,
            blendshapes: openEyes,
          }),
          context,
        ),
      );

      expect(events.map((event) => event.eventType)).toContain(
        "GAZE_AWAY_STARTED",
      );
    });

    it("routes a simultaneous head and iris departure through the aggregate path", () => {
      const detector = createDetector();
      const context = { quality, baseline, performanceProfile: "HIGH" as const };
      const events = [0, 300, 600, 1_000].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({
            timestampMs,
            yaw: 30,
            pitch: 22,
            eyeGaze: shiftedGaze,
            blendshapes: openEyes,
          }),
          context,
        ),
      );

      expect(detector.getState().attentionEvidenceMode).toBe(
        "CONSISTENT_DEPARTURE",
      );
      expect(events.map((event) => event.eventType)).toContain(
        "GAZE_AWAY_STARTED",
      );
    });

    it("reports the iris confidence gate when reliability passes but confidence does not", () => {
      // Diagonal gaze drives irisProxyScore to 0 so the strict path is entered,
      // reliability clears 0.8, and only irisOnlyMinimumConfidence is missing.
      const diagonal = {
        left: { horizontalRatio: 0.85, verticalRatio: 0.85 },
        right: { horizontalRatio: 0.85, verticalRatio: 0.85 },
        horizontalRatio: 0.85,
        verticalRatio: 0.85,
        binocularAgreementScore: 1,
      } as const;
      const detector = new ScreenAttentionDetector(
        {
          ...defaultVisionConfig.screenAttention,
          emaAlpha: 1,
          irisOnlyMinimumConfidence: 0.99,
        },
        createDetectorEventFactory(),
      );
      const context = { quality, baseline, performanceProfile: "HIGH" as const };
      const events = [0, 500, 1_000, 1_500, 2_000, 2_500].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({
            timestampMs,
            eyeGaze: diagonal,
            blendshapes: openEyes,
          }),
          context,
        ),
      );

      expect(events).toHaveLength(0);
      expect(detector.getState().gazeReliability).toBeGreaterThanOrEqual(
        defaultVisionConfig.screenAttention.irisOnlyMinimumReliability,
      );
      expect(detector.getState().entryBlockReason).toBe(
        "IRIS_CONFIDENCE_TOO_LOW",
      );
    });

    it("keeps the aggregate score and confidence reasons for head departures", () => {
      const context = { quality, baseline, performanceProfile: "HIGH" as const };

      // Head departs (headPoseScore 0.58 <= 0.6) but the aggregate score is
      // 83.8, still above attentionAwayScore.
      const mild = createDetector();
      mild.update(
        createNormalizedFaceFrame({
          timestampMs: 0,
          yaw: 15.5,
          pitch: 12.3,
          blendshapes: openEyes,
        }),
        context,
      );
      expect(mild.getState().entryBlockReason).toBe("SCORE_ABOVE_THRESHOLD");

      // Head departs, score is low enough, but event confidence is not.
      const strict = new ScreenAttentionDetector(
        {
          ...defaultVisionConfig.screenAttention,
          emaAlpha: 1,
          minimumEventConfidence: 0.99,
        },
        createDetectorEventFactory(),
      );
      strict.update(
        createNormalizedFaceFrame({
          timestampMs: 0,
          yaw: 30,
          pitch: 22,
          blendshapes: openEyes,
        }),
        context,
      );
      expect(strict.getState().entryBlockReason).toBe(
        "EVENT_CONFIDENCE_TOO_LOW",
      );
    });

    it("restarts the candidate timer when the candidate kind changes", () => {
      const detector = createDetector();
      const context = { quality, baseline, performanceProfile: "HIGH" as const };
      // 1.2s of iris-only accumulation, still short of the 2s requirement.
      for (const timestampMs of [0, 400, 800, 1_200]) {
        expect(
          detector.update(
            createNormalizedFaceFrame({
              timestampMs,
              eyeGaze: shiftedGaze,
              blendshapes: openEyes,
            }),
            context,
          ),
        ).toHaveLength(0);
      }

      // Head departure switches the kind to AGGREGATE. The 1s aggregate budget
      // must start now instead of inheriting the 1.2s already served.
      const switched = detector.update(
        createNormalizedFaceFrame({
          timestampMs: 1_300,
          yaw: 30,
          pitch: 22,
          eyeGaze: shiftedGaze,
          blendshapes: openEyes,
        }),
        context,
      );
      expect(switched).toHaveLength(0);
      expect(detector.getState().stateSinceMs).toBe(1_300);

      const events = [1_700, 2_000, 2_300].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({
            timestampMs,
            yaw: 30,
            pitch: 22,
            eyeGaze: shiftedGaze,
            blendshapes: openEyes,
          }),
          context,
        ),
      );
      expect(events.map((event) => event.eventType)).toContain(
        "GAZE_AWAY_STARTED",
      );
    });
  });

  describe("global fallback recovery", () => {
    const fallbackBaseline = createVisionBaseline({ status: "GLOBAL_FALLBACK" });

    function startFallbackEpisode(): ScreenAttentionDetector {
      const detector = new ScreenAttentionDetector(
        { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
        createDetectorEventFactory(),
      );
      const context = {
        quality,
        baseline: fallbackBaseline,
        performanceProfile: "HIGH" as const,
      };
      const started = [0, 500, 1_000, 1_500, 2_000].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({ timestampMs, yaw: 45 }),
          context,
        ),
      );
      expect(started.map((event) => event.eventType)).toContain(
        "GAZE_AWAY_STARTED",
      );
      return detector;
    }

    it("ends the episode as RECOVERED once the face returns inside the recovery band", () => {
      const detector = startFallbackEpisode();
      const context = {
        quality,
        baseline: fallbackBaseline,
        performanceProfile: "HIGH" as const,
      };
      const events = [2_500, 3_000, 3_500].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({ timestampMs, yaw: 30 }),
          context,
        ),
      );
      const ended = events.find(
        (event) => event.eventType === "GAZE_AWAY_ENDED",
      );

      expect(ended).toBeDefined();
      expect(
        ended?.eventType === "GAZE_AWAY_ENDED"
          ? ended.payload.terminationReason
          : null,
      ).toBe("RECOVERED");
    });

    it("does not flip state for a yaw between the recovery and entry angles", () => {
      const detector = startFallbackEpisode();
      const context = {
        quality,
        baseline: fallbackBaseline,
        performanceProfile: "HIGH" as const,
      };
      const events = [2_500, 3_000, 3_500, 4_000, 4_500, 5_000].flatMap(
        (timestampMs) =>
          detector.update(
            createNormalizedFaceFrame({ timestampMs, yaw: 37 }),
            context,
          ),
      );

      expect(
        events.filter((event) => event.eventType === "GAZE_AWAY_ENDED"),
      ).toHaveLength(0);
      expect(detector.getState().state).toBe("ACTIVE");
    });

    it("leaves the non-fallback recovery rule unchanged", () => {
      const detector = new ScreenAttentionDetector(
        { ...defaultVisionConfig.screenAttention, emaAlpha: 1 },
        createDetectorEventFactory(),
      );
      const context = { quality, baseline, performanceProfile: "HIGH" as const };
      const started = [0, 300, 600, 1_000].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({ timestampMs, yaw: 30, pitch: 22 }),
          context,
        ),
      );
      expect(started.map((event) => event.eventType)).toContain(
        "GAZE_AWAY_STARTED",
      );

      const events = [1_400, 1_800, 2_200].flatMap((timestampMs) =>
        detector.update(
          createNormalizedFaceFrame({ timestampMs, yaw: 0, pitch: 0 }),
          context,
        ),
      );
      expect(events.map((event) => event.eventType)).toContain(
        "GAZE_AWAY_ENDED",
      );
    });
  });
});
