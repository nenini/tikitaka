import { describe, expect, it } from "vitest";

import type { Clock } from "../../src/common/Clock.js";
import type {
  VisionBehaviorEvent,
  VisionEvent,
  VisionMetricSnapshot,
} from "../../src/vision/events/VisionEvent.js";
import {
  BufferedVisionEventPublisher,
  type VisionEventBatch,
  type VisionEventTransport,
} from "../../src/vision/events/VisionEventPublisher.js";
import { MutableClock } from "../helpers/MutableClock.js";

function behaviorEvent(eventId: string): VisionBehaviorEvent {
  return {
    eventId,
    eventType: "NOD_EVENT",
    version: 2,
    sessionId: "session-a",
    userId: "user-a",
    clientInstanceId: "76a06bb5-2022-4126-a0f0-e370369e2459",
    seq: 1,
    sessionElapsedMs: 100,
    clientMonotonicMs: 100,
    occurredAt: "2026-07-20T00:00:00.000Z",
    confidence: 0.8,
    source: "NOD_DETECTOR",
    modelVersion: "model-v1",
    ruleVersion: "rule-v1",
    kind: "behavior",
    episodeId: null,
    payload: {
      amplitudeDegrees: 9,
      durationMs: 500,
      downstrokeMs: 250,
      upstrokeMs: 250,
    },
  };
}

function metricEvent(eventId: string): VisionMetricSnapshot {
  return {
    eventId,
    eventType: "VISION_METRIC_SNAPSHOT",
    version: 2,
    sessionId: "session-a",
    userId: "user-a",
    clientInstanceId: "76a06bb5-2022-4126-a0f0-e370369e2459",
    seq: 2,
    sessionElapsedMs: 100,
    clientMonotonicMs: 100,
    occurredAt: "2026-07-20T00:00:00.000Z",
    confidence: 0.8,
    source: "VISION_PIPELINE",
    modelVersion: "model-v1",
    ruleVersion: "rule-v1",
    kind: "metric",
    payload: {
      quality: {
        usable: true,
        state: "USABLE",
        confidence: 0.9,
        components: {
          facePresence: 1,
          faceSize: 0.9,
          inFrame: 1,
          brightness: 0.8,
          blur: 0.8,
          poseObservability: 1,
          trackingStability: 0.9,
        },
        reasons: [],
        pendingReasons: [],
        faceDetected: true,
        faceCount: 1,
        faceBoxRatio: 0.2,
        brightnessScore: 0.8,
        blurScore: 0.8,
      },
      metrics: {
        smile: {
          configurationScore: 0.2,
          delta: 0,
          maintained: false,
          confidence: 0.9,
        },
        attention: {
          score: 90,
          confidence: 0.9,
          mode: "BINOCULAR",
        },
        activity: {
          upperFaceActivityScore: 0.2,
          lowerFaceActivityScore: 0.4,
          poseAlignedLandmarkActivityScore: 0.3,
          expressionActivityScore: 0.3,
          confidence: 0.8,
          experimentalOnly: true,
        },
        screenFacingScore: 0.9,
        smileScore: 0.2,
        expressionActivityScore: 0.3,
        yawDelta: 0,
        pitchDelta: 0,
        rollDelta: 0,
      },
      performance: {
        profile: "HIGH",
        targetFps: 5,
        actualFps: 5,
        meanProcessingMs: 10,
        droppedFramesSinceLastSnapshot: 0,
      },
    },
  };
}

class RecordingTransport implements VisionEventTransport {
  readonly batches: VisionEventBatch[] = [];
  failuresRemaining = 0;

  async send(batch: VisionEventBatch, _signal: AbortSignal): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("synthetic transport failure");
    }
    this.batches.push(batch);
  }
}

function createPublisher(
  transport: VisionEventTransport,
  clock: Clock,
  maximum = 10,
): BufferedVisionEventPublisher {
  return new BufferedVisionEventPublisher(
    transport,
    {
      transport: {
        batchIntervalMs: 500,
        maxBufferedEvents: maximum,
        maxBufferedAgeMs: 30_000,
      },
    },
    clock,
  );
}

describe("BufferedVisionEventPublisher", () => {
  it("partitions behavior events and metrics at the frontend transport boundary", async () => {
    const clock = new MutableClock();
    const transport = new RecordingTransport();
    const publisher = createPublisher(transport, clock);
    const events: readonly VisionEvent[] = [
      behaviorEvent("behavior-1"),
      metricEvent("metric-1"),
    ];

    const result = await publisher.publish(events);
    expect(result.bufferedEventIds).toEqual(["behavior-1", "metric-1"]);

    await publisher.flush();
    expect(transport.batches).toHaveLength(1);
    expect(transport.batches[0]?.behaviorEvents).toHaveLength(1);
    expect(transport.batches[0]?.metricSnapshots).toHaveLength(1);
    await publisher.close();
  });

  it("restores a failed batch and retries it without changing order", async () => {
    const transport = new RecordingTransport();
    transport.failuresRemaining = 1;
    const publisher = createPublisher(transport, new MutableClock());
    await publisher.publish([
      behaviorEvent("behavior-1"),
      behaviorEvent("behavior-2"),
    ]);

    await expect(publisher.flush()).rejects.toThrow(/synthetic/);
    expect(publisher.getStats().bufferedEvents).toBe(2);

    await publisher.flush();
    expect(
      transport.batches[0]?.behaviorEvents.map((event) => event.eventId),
    ).toEqual(["behavior-1", "behavior-2"]);
    await publisher.close();
  });

  it("drops metric snapshots before behavior transitions under capacity pressure", async () => {
    const publisher = createPublisher(
      new RecordingTransport(),
      new MutableClock(),
      2,
    );

    const result = await publisher.publish([
      metricEvent("metric-1"),
      behaviorEvent("behavior-1"),
      behaviorEvent("behavior-2"),
    ]);

    expect(result.droppedEventIds).toEqual(["metric-1"]);
    expect(result.bufferedEventIds).toEqual(["behavior-1", "behavior-2"]);
    await publisher.close({ flush: false });
  });

  it("discards buffered data when closing after consent withdrawal", async () => {
    const transport = new RecordingTransport();
    const publisher = createPublisher(transport, new MutableClock());
    await publisher.publish([behaviorEvent("behavior-1")]);

    await publisher.close({ flush: false });

    expect(transport.batches).toHaveLength(0);
    expect(publisher.getStats()).toMatchObject({
      bufferedEvents: 0,
      closed: true,
    });
    await expect(
      publisher.publish([behaviorEvent("behavior-2")]),
    ).rejects.toThrow(/closed/);
  });

  it("aborts an in-flight transport when consent is withdrawn", async () => {
    let aborted = false;
    const transport: VisionEventTransport = {
      send: async (_batch, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    };
    const publisher = createPublisher(transport, new MutableClock());
    await publisher.publish([behaviorEvent("behavior-1")]);
    void publisher.flush().catch(() => undefined);
    await Promise.resolve();

    await publisher.close({ flush: false });

    expect(aborted).toBe(true);
    expect(publisher.getStats().bufferedEvents).toBe(0);
  });
});
