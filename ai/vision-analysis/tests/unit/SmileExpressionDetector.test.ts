import { describe, expect, it } from "vitest";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { SmileExpressionDetector } from "../../src/vision/detectors/SmileExpressionDetector.js";
import { createDetectorEventFactory } from "../helpers/createDetectorTestKit.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";
import { createVisionBaseline } from "../helpers/createVisionBaseline.js";

const baseline = createVisionBaseline({
  mouthSmileLeft: 0.05,
  mouthSmileRight: 0.05,
  baselineSmileScore: 0.05,
  blendshapeMeans: { mouthSmileLeft: 0.05, mouthSmileRight: 0.05 },
});
const context = { quality: { usable: true, confidence: 0.9, reasons: [] } as const, baseline, performanceProfile: "HIGH" as const };
const smile = { mouthSmileLeft: 0.7, mouthSmileRight: 0.7, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 };

describe("SmileExpressionDetector", () => {
  it("requires duration and merges a short recovery gap", () => {
    const detector = new SmileExpressionDetector(defaultVisionConfig.smile, createDetectorEventFactory());
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 0, blendshapes: smile }), context)).toHaveLength(0);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 200, blendshapes: smile }), context)).toHaveLength(0);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 400, blendshapes: smile }), context)[0]?.eventType).toBe("SMILE_STARTED");
    const relaxed = { mouthSmileLeft: 0, mouthSmileRight: 0 };
    detector.update(createNormalizedFaceFrame({ timestampMs: 600, blendshapes: relaxed }), context);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 1_000, blendshapes: smile }), context)).toHaveLength(0);
    detector.update(createNormalizedFaceFrame({ timestampMs: 1_200, blendshapes: relaxed }), context);
    detector.update(createNormalizedFaceFrame({ timestampMs: 1_600, blendshapes: relaxed }), context);
    detector.update(createNormalizedFaceFrame({ timestampMs: 2_000, blendshapes: relaxed }), context);
    expect(detector.update(createNormalizedFaceFrame({ timestampMs: 2_400, blendshapes: relaxed }), context)[0]?.eventType).toBe("SMILE_ENDED");
  });

  it("treats missing mouth keys as unavailable but accepts explicit zero", () => {
    const detector = new SmileExpressionDetector(
      defaultVisionConfig.smile,
      createDetectorEventFactory(),
    );
    detector.update(
      createNormalizedFaceFrame({ timestampMs: 0, blendshapes: {} }),
      context,
    );
    expect(detector.getState().state).toBe("SUSPENDED");
    expect(detector.getState().signalAvailable).toBe(false);

    detector.update(
      createNormalizedFaceFrame({
        timestampMs: 200,
        blendshapes: { mouthSmileLeft: 0, mouthSmileRight: 0 },
      }),
      context,
    );
    expect(detector.getState().signalAvailable).toBe(true);
    expect(detector.getState().smileConfigurationScore).toBe(0);
  });

  it("keeps a short suspension in one episode and ends a long one at failure start", () => {
    const detector = new SmileExpressionDetector(
      defaultVisionConfig.smile,
      createDetectorEventFactory(),
    );
    for (const timestampMs of [0, 200, 400]) {
      detector.update(
        createNormalizedFaceFrame({ timestampMs, blendshapes: smile }),
        context,
      );
    }

    expect(
      detector.suspend({
        sessionElapsedMs: 500,
        clientMonotonicMs: 500,
        reason: "ANALYSIS_UNAVAILABLE",
        suspensionStartedElapsedMs: 500,
      }),
    ).toHaveLength(0);
    detector.update(
      createNormalizedFaceFrame({
        timestampMs: 1_000,
        blendshapes: smile,
      }),
      context,
    );
    expect(detector.getState().state).toBe("ACTIVE");

    const ended = detector.suspend({
      sessionElapsedMs: 2_201,
      clientMonotonicMs: 2_201,
      reason: "ANALYSIS_UNAVAILABLE",
      suspensionStartedElapsedMs: 1_100,
    });
    expect(ended[0]?.eventType).toBe("SMILE_ENDED");
    if (ended[0]?.eventType !== "SMILE_ENDED") {
      throw new Error("expected a smile end event");
    }
    expect(ended[0].payload).toMatchObject({
      observedEndElapsedMs: 1_100,
      wallDurationMs: 1_100,
      terminationReason: "ANALYSIS_UNAVAILABLE",
    });
    expect(
      ended[0].payload.observedDurationMs +
        ended[0].payload.unobservedDurationMs,
    ).toBe(ended[0].payload.wallDurationMs);
  });

  it("ends an active episode immediately when the camera is disabled", () => {
    const detector = new SmileExpressionDetector(
      defaultVisionConfig.smile,
      createDetectorEventFactory(),
    );
    for (const timestampMs of [0, 200, 400]) {
      detector.update(
        createNormalizedFaceFrame({ timestampMs, blendshapes: smile }),
        context,
      );
    }

    const events = detector.suspend({
      sessionElapsedMs: 500,
      clientMonotonicMs: 500,
      reason: "CAMERA_DISABLED",
    });
    expect(events[0]?.eventType).toBe("SMILE_ENDED");
    if (events[0]?.eventType === "SMILE_ENDED") {
      expect(events[0].payload.terminationReason).toBe("CAMERA_DISABLED");
      expect(events[0].payload.observedEndElapsedMs).toBe(500);
    }
  });

  it("uses mouth-only scoring and keeps configuration separate from change", () => {
    const highBaseline = createVisionBaseline({
      mouthSmileLeft: 0.5,
      mouthSmileRight: 0.5,
      baselineSmileScore: 0.5,
    });
    const highBaselineContext = { ...context, baseline: highBaseline };
    const detector = new SmileExpressionDetector(
      defaultVisionConfig.smile,
      createDetectorEventFactory(),
    );
    const frames = [0, 200, 400, 800].flatMap((timestampMs) =>
      detector.update(
        createNormalizedFaceFrame({
          timestampMs,
          blendshapes: {
            mouthSmileLeft: 0.5,
            mouthSmileRight: 0.5,
            cheekSquintLeft: timestampMs === 800 ? 1 : 0,
            cheekSquintRight: timestampMs === 800 ? 1 : 0,
          },
        }),
        highBaselineContext,
      ),
    );

    expect(frames).toHaveLength(0);
    expect(detector.getState().smileConfigurationLevel).toBe(
      "SMILE_CONFIGURATION",
    );
    expect(detector.getState().smileChangeLevel).toBe(
      "NO_SIGNIFICANT_INCREASE",
    );
    expect(detector.getState().rawScore).toBe(0.5);
    expect(detector.getState().smilePromptSuppressedByBaseline).toBe(true);
    expect(detector.getState().baselinePromptSuppressionScore).toBe(0.15);
  });

  it("keeps smile prompting available below the dedicated baseline cutoff", () => {
    const lowBaseline = createVisionBaseline({
      mouthSmileLeft: 0.14,
      mouthSmileRight: 0.14,
      baselineSmileScore: 0.14,
    });
    const detector = new SmileExpressionDetector(
      defaultVisionConfig.smile,
      createDetectorEventFactory(),
    );

    detector.update(
      createNormalizedFaceFrame({
        timestampMs: 0,
        blendshapes: {
          mouthSmileLeft: 0.14,
          mouthSmileRight: 0.14,
        },
      }),
      { ...context, baseline: lowBaseline },
    );

    expect(detector.getState().smilePromptSuppressedByBaseline).toBe(false);
  });

  it("exposes a maintained subtle configuration without a behavior event", () => {
    const detector = new SmileExpressionDetector(
      defaultVisionConfig.smile,
      createDetectorEventFactory(),
    );
    const subtle = { mouthSmileLeft: 0.25, mouthSmileRight: 0.25 };
    const events = [0, 500, 1_000, 2_000, 3_000].flatMap((timestampMs) =>
      detector.update(
        createNormalizedFaceFrame({ timestampMs, blendshapes: subtle }),
        context,
      ),
    );
    expect(events).toHaveLength(0);
    expect(detector.getState().maintainedSmileConfiguration).toBe(true);
    expect(detector.getState().maintainedDurationMs).toBe(3_000);
  });

  it("reduces confidence for asymmetric mouth movement", () => {
    const detector = new SmileExpressionDetector(
      defaultVisionConfig.smile,
      createDetectorEventFactory(),
    );
    detector.update(
      createNormalizedFaceFrame({
        timestampMs: 0,
        blendshapes: { mouthSmileLeft: 0.8, mouthSmileRight: 0.45 },
      }),
      context,
    );
    expect(detector.getState().mouthAsymmetry).toBeCloseTo(0.35);
    expect(detector.getState().measurementConfidence).toBeLessThan(
      context.quality.confidence,
    );
  });
});
