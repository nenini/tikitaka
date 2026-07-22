import { describe, expect, it } from "vitest";

import { SessionTimeline } from "../../src/common/SessionTimeline.js";
import {
  FrameSampler,
  type FrameSampleConsumer,
  type SampledVideoFrame,
} from "../../src/vision/core/FrameSampler.js";
import { MutableClock } from "../helpers/MutableClock.js";

class FakeVideoElement {
  videoWidth = 1280;
  videoHeight = 720;
  private nextId = 1;
  private readonly callbacks = new Map<number, VideoFrameRequestCallback>();

  requestVideoFrameCallback(callback: VideoFrameRequestCallback): number {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  }

  cancelVideoFrameCallback(id: number): void {
    this.callbacks.delete(id);
  }

  fireNext(now: number): void {
    const entry = this.callbacks.entries().next().value as
      | [number, VideoFrameRequestCallback]
      | undefined;
    if (entry === undefined) {
      throw new Error("no video frame callback is scheduled");
    }
    const [id, callback] = entry;
    this.callbacks.delete(id);
    callback(now, {} as VideoFrameCallbackMetadata);
  }
}

function createFakeBitmap(onClose: () => void): ImageBitmap {
  return {
    width: 1280,
    height: 720,
    close: onClose,
  } as ImageBitmap;
}

describe("FrameSampler", () => {
  it("keeps one frame in flight and drops stale frames instead of queuing", async () => {
    const video = new FakeVideoElement();
    const clock = new MutableClock();
    const timeline = new SessionTimeline(
      { sessionElapsedMsAtSync: 0, clientMonotonicMsAtSync: 0 },
      clock,
    );
    let resolveConsumption: () => void = () => undefined;
    const consumption = new Promise<void>((resolve) => {
      resolveConsumption = resolve;
    });
    const consumed: SampledVideoFrame[] = [];
    const consumer: FrameSampleConsumer = {
      consume: async (frame) => {
        consumed.push(frame);
        await consumption;
      },
    };
    let closeCalls = 0;
    const sampler = new FrameSampler(
      video as unknown as HTMLVideoElement,
      consumer,
      timeline,
      clock,
      async () => createFakeBitmap(() => {
        closeCalls += 1;
      }),
      5,
      "HIGH",
    );

    sampler.start();
    clock.set(1_000);
    video.fireNext(1_000);
    await Promise.resolve();

    clock.set(1_200);
    video.fireNext(1_200);
    expect(sampler.getStats().droppedFrames).toBe(1);
    expect(consumed).toHaveLength(1);

    resolveConsumption();
    await consumption;
    await Promise.resolve();
    sampler.stop();

    expect(closeCalls).toBe(1);
    expect(consumed[0]?.frameId).toBe(1);
    expect(consumed[0]?.sessionElapsedMs).toBe(1_000);
  });

  it("does not sample before video dimensions are available", () => {
    const video = new FakeVideoElement();
    video.videoWidth = 0;
    video.videoHeight = 0;
    const clock = new MutableClock();
    const sampler = new FrameSampler(
      video as unknown as HTMLVideoElement,
      { consume: async () => undefined },
      new SessionTimeline(
        { sessionElapsedMsAtSync: 0, clientMonotonicMsAtSync: 0 },
        clock,
      ),
      clock,
      async () => createFakeBitmap(() => undefined),
    );

    sampler.start();
    video.fireNext(0);
    sampler.stop();

    expect(sampler.getStats().acceptedFrames).toBe(0);
  });
});
