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
});
