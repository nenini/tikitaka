import { describe, expect, it } from "vitest";

import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import type { SampledVideoFrame } from "../../src/vision/core/FrameSampler.js";
import type { NormalizedFaceFrame } from "../../src/vision/core/NormalizedFaceFrame.js";
import { VisionWorkerClient } from "../../src/vision/core/VisionWorkerClient.js";
import type {
  VisionWorkerRequest,
  VisionWorkerResponse,
} from "../../src/vision/workers/visionWorkerMessages.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";

type MessageListener = (event: MessageEvent<unknown>) => void;
type ErrorListener = (event: ErrorEvent) => void;

class FakeWorker {
  readonly messages: Array<{
    readonly message: VisionWorkerRequest;
    readonly transfer: readonly Transferable[];
  }> = [];
  terminated = false;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  postMessage(message: VisionWorkerRequest, transfer: Transferable[]): void {
    this.messages.push({ message, transfer });
  }

  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "error", listener: ErrorListener): void;
  addEventListener(
    type: "message" | "error",
    listener: MessageListener | ErrorListener,
  ): void {
    if (type === "message") {
      this.messageListeners.add(listener as MessageListener);
    } else {
      this.errorListeners.add(listener as ErrorListener);
    }
  }

  removeEventListener(type: "message", listener: MessageListener): void;
  removeEventListener(type: "error", listener: ErrorListener): void;
  removeEventListener(
    type: "message" | "error",
    listener: MessageListener | ErrorListener,
  ): void {
    if (type === "message") {
      this.messageListeners.delete(listener as MessageListener);
    } else {
      this.errorListeners.delete(listener as ErrorListener);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(response: VisionWorkerResponse): void {
    const event = { data: response } as MessageEvent<unknown>;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }
}

function createBitmap(): ImageBitmap {
  return { width: 480, height: 360, close: () => undefined } as ImageBitmap;
}

function createSampledFrame(): SampledVideoFrame {
  return {
    frameId: 1,
    bitmap: createBitmap(),
    sourceWidth: 1280,
    sourceHeight: 720,
    sessionElapsedMs: 1_000,
    clientMonotonicMs: 1_000,
    capturedAt: "2026-07-20T00:00:01.000Z",
    targetFps: 5,
    actualFps: 5,
    performanceProfile: "HIGH",
  };
}

describe("VisionWorkerClient", () => {
  it("initializes, transfers one frame, and disposes the Worker", async () => {
    const worker = new FakeWorker();
    const observedFrames: NormalizedFaceFrame[] = [];
    const client = new VisionWorkerClient(worker, (frame) => {
      observedFrames.push(frame);
    });

    const initialization = client.initialize(defaultVisionConfig);
    expect(worker.messages[0]?.message.type).toBe("INITIALIZE");
    worker.emit({
      type: "READY",
      delegate: "CPU",
      handDelegate: "CPU",
    });
    await initialization;
    expect(client.getDelegate()).toBe("CPU");
    expect(client.getHandDelegate()).toBe("CPU");

    const sampledFrame = createSampledFrame();
    const processing = client.consume(sampledFrame);
    const processMessage = worker.messages[1];
    expect(processMessage?.message.type).toBe("PROCESS_FRAME");
    expect(processMessage?.transfer).toEqual([sampledFrame.bitmap]);
    worker.emit({
      type: "FRAME_RESULT",
      frame: createNormalizedFaceFrame({ timestampMs: 1_000 }),
    });
    await processing;
    expect(observedFrames).toHaveLength(1);

    const disposal = client.dispose();
    expect(worker.messages[2]?.message.type).toBe("DISPOSE");
    worker.emit({ type: "DISPOSED" });
    await disposal;
    expect(worker.terminated).toBe(true);
  });

  it("rejects a second frame while inference is in flight", async () => {
    const worker = new FakeWorker();
    const client = new VisionWorkerClient(worker, () => undefined);
    const initialization = client.initialize(defaultVisionConfig);
    worker.emit({
      type: "READY",
      delegate: "CPU",
      handDelegate: "GPU",
    });
    await initialization;

    const first = client.processFrame(createSampledFrame());
    await expect(client.processFrame(createSampledFrame())).rejects.toThrow(
      /already in flight/,
    );
    worker.emit({
      type: "FRAME_RESULT",
      frame: createNormalizedFaceFrame({ timestampMs: 1_000 }),
    });
    await first;
  });
});
