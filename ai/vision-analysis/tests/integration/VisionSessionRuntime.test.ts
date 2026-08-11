import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MonotonicSequenceGenerator } from "../../src/common/SequenceGenerator.js";
import { SessionTimeline } from "../../src/common/SessionTimeline.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import type { PerformanceProfile } from "../../src/vision/core/NormalizedFaceFrame.js";
import { PerformanceGovernor } from "../../src/vision/core/PerformanceGovernor.js";
import { VisionPipeline } from "../../src/vision/core/VisionPipeline.js";
import {
  VisionSessionRuntime,
  type VisionSamplerControl,
} from "../../src/vision/core/VisionSessionRuntime.js";
import type { VisionEvent } from "../../src/vision/events/VisionEvent.js";
import { VisionEventFactory } from "../../src/vision/events/VisionEventFactory.js";
import type {
  VisionEventPublisher,
  VisionPublisherCloseOptions,
  VisionPublishResult,
} from "../../src/vision/events/VisionEventPublisher.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";
import { MutableClock } from "../helpers/MutableClock.js";

class RecordingPublisher implements VisionEventPublisher {
  readonly published: VisionEvent[][] = [];
  closeOptions: VisionPublisherCloseOptions | null = null;

  async publish(events: readonly VisionEvent[]): Promise<VisionPublishResult> {
    this.published.push([...events]);
    return {
      acceptedEventIds: events.map((event) => event.eventId),
      bufferedEventIds: [],
      droppedEventIds: [],
    };
  }

  async flush(): Promise<void> {}

  async close(options?: VisionPublisherCloseOptions): Promise<void> {
    this.closeOptions = options ?? {};
  }
}

class RecordingSampler implements VisionSamplerControl {
  stopped = false;
  droppedFrames = 0;
  readonly profileChanges: Array<{
    profile: PerformanceProfile;
    targetFps: number;
  }> = [];

  stop(): void {
    this.stopped = true;
  }

  setPerformanceProfile(
    profile: PerformanceProfile,
    targetFps: number,
  ): void {
    this.profileChanges.push({ profile, targetFps });
  }

  getStats() {
    return {
      acceptedFrames: 0,
      droppedFrames: this.droppedFrames,
      inFlight: false,
      actualFps: 5,
    };
  }
}

function createPipeline(clock: MutableClock): VisionPipeline {
  return new VisionPipeline(
    defaultVisionConfig,
    new VisionEventFactory(
      {
        sessionId: "runtime-session",
        userId: "user-a",
        clientInstanceId: "76a06bb5-2022-4126-a0f0-e370369e2459",
      },
      {
        modelVersion: defaultVisionConfig.model.modelVersion,
        ruleVersion: defaultVisionConfig.model.ruleVersion,
      },
      new SessionTimeline(
        { sessionElapsedMsAtSync: 0, clientMonotonicMsAtSync: 0 },
        clock,
      ),
      clock,
      new MonotonicSequenceGenerator(),
      randomUUID,
    ),
  );
}

describe("VisionSessionRuntime", () => {
  it("forwards sampler drops into metrics and clears resources on consent withdrawal", async () => {
    const clock = new MutableClock();
    const publisher = new RecordingPublisher();
    const sampler = new RecordingSampler();
    const resource = {
      disposed: false,
      dispose(): void {
        this.disposed = true;
      },
    };
    const runtime = new VisionSessionRuntime(
      createPipeline(clock),
      publisher,
      new PerformanceGovernor(defaultVisionConfig),
      sampler,
      [resource],
    );

    sampler.droppedFrames = 2;
    const frameResult = await runtime.process(
      createNormalizedFaceFrame({ timestampMs: 0 }),
    );
    expect(
      frameResult.pipeline.metricSnapshot?.payload.performance
        .droppedFramesSinceLastSnapshot,
    ).toBe(2);

    const endResult = await runtime.end("CONSENT_WITHDRAWN", {
      sessionElapsedMs: 100,
      clientMonotonicMs: 100,
    });

    expect(endResult.cleanupFailures).toEqual([]);
    expect(sampler.stopped).toBe(true);
    expect(resource.disposed).toBe(true);
    expect(publisher.closeOptions).toEqual({ flush: false });
    expect(
      endResult.finalEvents.some((event) => event.kind === "metric"),
    ).toBe(false);
    expect(publisher.published).toHaveLength(1);
    expect(runtime.getState()).toBe("ENDED");
    await expect(
      runtime.process(createNormalizedFaceFrame({ timestampMs: 200 })),
    ).rejects.toThrow(/not active/);
  });

  it("flushes final events when the session ends normally", async () => {
    const clock = new MutableClock();
    const publisher = new RecordingPublisher();
    const runtime = new VisionSessionRuntime(
      createPipeline(clock),
      publisher,
      new PerformanceGovernor(defaultVisionConfig),
      new RecordingSampler(),
    );

    await runtime.process(
      createNormalizedFaceFrame({ timestampMs: 0 }),
    );
    await runtime.end("SESSION_ENDED", {
      sessionElapsedMs: 100,
      clientMonotonicMs: 100,
    });

    const finalBatch = publisher.published.at(-1);
    expect(finalBatch?.filter((event) => event.kind === "metric")).toHaveLength(
      1,
    );
    expect(finalBatch?.find((event) => event.kind === "metric")).toMatchObject({
      sessionElapsedMs: 100,
      payload: {
        observationInterval: {
          startedAtSessionElapsedMs: 0,
          endedAtSessionElapsedMs: 100,
          observedDurationMs: 0,
        },
      },
    });
    expect(publisher.closeOptions).toEqual({ flush: true });
  });

  it("delegates the global baseline fallback down to the pipeline", async () => {
    const clock = new MutableClock();
    const runtime = new VisionSessionRuntime(
      createPipeline(clock),
      new RecordingPublisher(),
      new PerformanceGovernor(defaultVisionConfig),
      new RecordingSampler(),
      [],
    );

    const before = await runtime.process(
      createNormalizedFaceFrame({ timestampMs: 0, brightnessScore: 0.05 }),
    );
    expect(before.pipeline.calibration.status).not.toBe("GLOBAL_FALLBACK");

    const state = runtime.useGlobalBaselineFallback(1_000);
    expect(state.status).toBe("GLOBAL_FALLBACK");
    expect(state.baseline.calibratedAtSessionElapsedMs).toBe(1_000);

    const after = await runtime.process(
      createNormalizedFaceFrame({ timestampMs: 1_200 }),
    );
    expect(after.pipeline.calibration.status).toBe("GLOBAL_FALLBACK");
  });
});
