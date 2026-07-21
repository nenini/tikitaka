import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MonotonicSequenceGenerator } from "../../src/common/SequenceGenerator.js";
import { SessionTimeline } from "../../src/common/SessionTimeline.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import {
  FaceQualityDetector,
  type FaceQualityRuntimeStatus,
} from "../../src/vision/detectors/FaceQualityDetector.js";
import { visionBehaviorEventSchema } from "../../src/vision/events/VisionEventSchema.js";
import { VisionEventFactory } from "../../src/vision/events/VisionEventFactory.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";
import { MutableClock } from "../helpers/MutableClock.js";

const healthyRuntime: FaceQualityRuntimeStatus = {
  cameraEnabled: true,
  trackEnded: false,
  videoDimensionsAvailable: true,
  tabVisible: true,
  landmarkerAvailable: true,
  workerHealthy: true,
};

function createDetector(clock: MutableClock): FaceQualityDetector {
  const timeline = new SessionTimeline(
    { sessionElapsedMsAtSync: 0, clientMonotonicMsAtSync: 0 },
    clock,
  );
  const factory = new VisionEventFactory(
    {
      sessionId: "session-123",
      userId: "user-a",
      clientInstanceId: "76a06bb5-2022-4126-a0f0-e370369e2459",
    },
    {
      modelVersion: defaultVisionConfig.model.modelVersion,
      ruleVersion: defaultVisionConfig.model.ruleVersion,
    },
    timeline,
    clock,
    new MonotonicSequenceGenerator(),
    randomUUID,
  );
  return new FaceQualityDetector(defaultVisionConfig.quality, factory);
}

describe("FaceQualityDetector", () => {
  it("does not emit for a single missing frame, then emits after minimum duration", () => {
    const clock = new MutableClock();
    const detector = createDetector(clock);

    clock.set(0);
    const first = detector.update(
      createNormalizedFaceFrame({ timestampMs: 0, faceDetected: false }),
    );
    clock.set(599);
    const short = detector.update(
      createNormalizedFaceFrame({ timestampMs: 599, faceDetected: false }),
    );
    clock.set(600);
    const confirmed = detector.update(
      createNormalizedFaceFrame({ timestampMs: 600, faceDetected: false }),
    );

    expect(first.events).toHaveLength(0);
    expect(short.events).toHaveLength(0);
    expect(confirmed.events.map((event) => event.eventType)).toEqual([
      "FACE_MISSING_STARTED",
      "ANALYSIS_UNAVAILABLE",
    ]);
    expect(confirmed.decision.usable).toBe(false);
    for (const event of confirmed.events) {
      expect(visionBehaviorEventSchema.parse(event)).toEqual(event);
    }
  });

  it("emits one end event and recovers only after warm-up", () => {
    const clock = new MutableClock();
    const detector = createDetector(clock);

    for (const timestampMs of [0, 600]) {
      clock.set(timestampMs);
      detector.update(
        createNormalizedFaceFrame({ timestampMs, faceDetected: false }),
      );
    }
    clock.set(700);
    detector.update(createNormalizedFaceFrame({ timestampMs: 700 }));
    clock.set(1_200);
    const ended = detector.update(
      createNormalizedFaceFrame({ timestampMs: 1_200 }),
    );
    clock.set(2_199);
    const warming = detector.update(
      createNormalizedFaceFrame({ timestampMs: 2_199 }),
    );
    clock.set(2_200);
    const recovered = detector.update(
      createNormalizedFaceFrame({ timestampMs: 2_200 }),
    );

    expect(ended.events.map((event) => event.eventType)).toEqual([
      "FACE_MISSING_ENDED",
    ]);
    expect(ended.decision.usable).toBe(false);
    expect(warming.events).toHaveLength(0);
    expect(warming.decision.usable).toBe(false);
    expect(recovered.events.map((event) => event.eventType)).toEqual([
      "ANALYSIS_RECOVERED",
    ]);
    expect(recovered.decision.usable).toBe(true);
  });

  it("does not duplicate ANALYSIS_UNAVAILABLE when another reason activates", () => {
    const clock = new MutableClock();
    const detector = createDetector(clock);

    for (const timestampMs of [0, 600, 1_000]) {
      clock.set(timestampMs);
      const output = detector.update(
        createNormalizedFaceFrame({
          timestampMs,
          faceDetected: false,
          brightnessScore: 0.1,
        }),
      );
      if (timestampMs === 1_000) {
        expect(output.events.map((event) => event.eventType)).toEqual([
          "LOW_LIGHT_STARTED",
        ]);
      }
    }
  });

  it("treats an ended camera track as immediately unavailable", () => {
    const clock = new MutableClock();
    const detector = createDetector(clock);
    const output = detector.update(createNormalizedFaceFrame(), {
      ...healthyRuntime,
      cameraEnabled: false,
      trackEnded: true,
    });

    expect(output.decision.reasons).toEqual(["TRACK_ENDED"]);
    expect(output.events.map((event) => event.eventType)).toEqual([
      "ANALYSIS_UNAVAILABLE",
    ]);
  });

  it("clears state on reset", () => {
    const clock = new MutableClock();
    const detector = createDetector(clock);
    detector.update(
      createNormalizedFaceFrame({ timestampMs: 0, faceDetected: false }),
    );

    detector.reset();

    expect(detector.getState().state).toBe("USABLE");
    expect(detector.getState().activeReasons).toEqual([]);
  });
});

