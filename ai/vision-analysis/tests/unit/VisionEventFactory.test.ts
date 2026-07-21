import { describe, expect, it } from "vitest";

import type { Clock } from "../../src/common/Clock.js";
import { MonotonicSequenceGenerator } from "../../src/common/SequenceGenerator.js";
import { SessionTimeline } from "../../src/common/SessionTimeline.js";
import { VisionEventFactory } from "../../src/vision/events/VisionEventFactory.js";
import { visionEventSchema } from "../../src/vision/events/VisionEventSchema.js";

class FakeClock implements Clock {
  constructor(
    private readonly monotonicMs: number,
    private readonly wallMs: number,
  ) {}

  monotonicNowMs(): number {
    return this.monotonicMs;
  }

  wallClockNowMs(): number {
    return this.wallMs;
  }
}

describe("VisionEventFactory", () => {
  it("assigns identity, synchronized time, source, and a monotonic sequence", () => {
    const clock = new FakeClock(1_000, Date.parse("2026-07-20T10:30:00.800Z"));
    const sequence = new MonotonicSequenceGenerator();
    const timeline = new SessionTimeline(
      {
        sessionElapsedMsAtSync: 5_000,
        clientMonotonicMsAtSync: 500,
      },
      clock,
    );
    const ids = [
      "7b575df8-5ca3-4f58-a44e-0f2e825488e1",
      "1ba268b7-d0ce-42ae-b2f4-cd78af569a7d",
    ];
    const uuidFactory = (): string => {
      const id = ids.shift();
      if (id === undefined) {
        throw new Error("test UUIDs exhausted");
      }
      return id;
    };
    const factory = new VisionEventFactory(
      {
        sessionId: "session-123",
        userId: "user-a",
        clientInstanceId: "76a06bb5-2022-4126-a0f0-e370369e2459",
      },
      {
        modelVersion: "mediapipe-face-landmarker-v1",
        ruleVersion: "vision-rule-v1",
      },
      timeline,
      clock,
      sequence,
      uuidFactory,
    );

    const event = factory.createBehaviorEvent("SMILE_STARTED", {
      confidence: 0.84,
      episodeId: "36912865-d134-4691-b826-1dacd10f68f3",
      payload: {
        observedStartElapsedMs: 5_100,
        smileScore: 0.52,
        baselineDelta: 0.21,
      },
    });
    const snapshot = factory.createMetricSnapshot({
      confidence: 0.9,
      payload: {
        quality: {
          usable: true,
          reasons: [],
          faceDetected: true,
          faceCount: 1,
          faceBoxRatio: 0.16,
          brightnessScore: 0.7,
          blurScore: 0.8,
        },
        metrics: {
          screenFacingScore: 0.8,
          smileScore: 0.52,
          expressionActivityScore: 0.4,
          yawDelta: 2,
          pitchDelta: -1,
          rollDelta: 0,
        },
        performance: {
          profile: "HIGH",
          targetFps: 5,
          actualFps: 4.9,
          meanProcessingMs: 40,
          droppedFramesSinceLastSnapshot: 0,
        },
      },
    });

    expect(event.source).toBe("SMILE_EXPRESSION_DETECTOR");
    expect(event.seq).toBe(1);
    expect(event.sessionElapsedMs).toBe(5_500);
    expect(event.occurredAt).toBe("2026-07-20T10:30:00.800Z");
    expect(snapshot.seq).toBe(2);
    expect(visionEventSchema.parse(event)).toEqual(event);
    expect(visionEventSchema.parse(snapshot)).toEqual(snapshot);
  });
});

