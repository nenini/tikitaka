import type { Clock } from "../../common/Clock.js";
import { toIsoTimestamp } from "../../common/Clock.js";
import type { SessionTimeline } from "../../common/SessionTimeline.js";
import type { PerformanceProfile } from "./NormalizedFaceFrame.js";

export interface SampledVideoFrame {
  readonly frameId: number;
  readonly bitmap: ImageBitmap;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly sessionElapsedMs: number;
  readonly clientMonotonicMs: number;
  readonly capturedAt: string;
  readonly targetFps: number;
  readonly actualFps: number;
  readonly performanceProfile: PerformanceProfile;
}

export interface FrameSampleConsumer {
  consume(frame: SampledVideoFrame): Promise<void>;
}

export interface FrameSamplerStats {
  readonly acceptedFrames: number;
  readonly droppedFrames: number;
  readonly inFlight: boolean;
  readonly actualFps: number;
}

type CreateBitmap = (source: ImageBitmapSource) => Promise<ImageBitmap>;
export type FrameSamplerErrorListener = (error: Error) => void;

/**
 * Samples rendered camera frames without building a queue.
 *
 * Only one frame may be in flight. When inference is slower than the target
 * interval, old frames are skipped so coaching latency does not grow over time.
 */
export class FrameSampler {
  private running = false;
  private inFlight = false;
  private frameId = 0;
  private acceptedFrames = 0;
  private droppedFrames = 0;
  private lastAcceptedMonotonicMs: number | null = null;
  private actualFps = 0;
  private videoCallbackId: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly consumer: FrameSampleConsumer,
    private readonly timeline: SessionTimeline,
    private readonly clock: Clock,
    // Wrap the browser native so it is not invoked with FrameSampler as `this`.
    private readonly createBitmap: CreateBitmap = (source) => createImageBitmap(source),
    private targetFps = 5,
    private performanceProfile: PerformanceProfile = "HIGH",
    private readonly onError: FrameSamplerErrorListener = () => undefined,
  ) {
    this.assertTargetFps(targetFps);
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNextFrame();
  }

  stop(): void {
    this.running = false;

    if (this.videoCallbackId !== null) {
      this.video.cancelVideoFrameCallback(this.videoCallbackId);
      this.videoCallbackId = null;
    }

    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  setPerformanceProfile(
    profile: PerformanceProfile,
    targetFps: number,
  ): void {
    this.assertTargetFps(targetFps);
    this.performanceProfile = profile;
    this.targetFps = targetFps;
  }

  getStats(): FrameSamplerStats {
    return {
      acceptedFrames: this.acceptedFrames,
      droppedFrames: this.droppedFrames,
      inFlight: this.inFlight,
      actualFps: this.actualFps,
    };
  }

  private scheduleNextFrame(): void {
    if (!this.running) {
      return;
    }

    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.videoCallbackId = this.video.requestVideoFrameCallback(
        this.handleVideoFrame,
      );
      return;
    }

    // The timer path is a compatibility fallback; current Chrome/Edge use rVFC.
    this.timerId = setTimeout(
      () => this.onFrameAvailable(),
      Math.max(1, Math.round(1_000 / this.targetFps)),
    );
  }

  private readonly handleVideoFrame: VideoFrameRequestCallback = (): void => {
    this.onFrameAvailable();
  };

  private onFrameAvailable(): void {
    this.videoCallbackId = null;
    this.timerId = null;
    this.scheduleNextFrame();

    const monotonicMs = this.clock.monotonicNowMs();
    const intervalMs = 1_000 / this.targetFps;
    if (
      this.lastAcceptedMonotonicMs !== null &&
      monotonicMs - this.lastAcceptedMonotonicMs < intervalMs
    ) {
      return;
    }

    if (this.inFlight) {
      this.droppedFrames += 1;
      return;
    }

    if (this.video.videoWidth <= 0 || this.video.videoHeight <= 0) {
      return;
    }

    this.inFlight = true;
    void this.captureAndConsume(monotonicMs)
      .catch((error: unknown) => {
        this.onError(
          error instanceof Error ? error : new Error("Frame sampling failed"),
        );
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  private async captureAndConsume(monotonicMs: number): Promise<void> {
    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await this.createBitmap(this.video);
      const previousMs = this.lastAcceptedMonotonicMs;
      this.lastAcceptedMonotonicMs = monotonicMs;
      this.actualFps =
        previousMs === null || monotonicMs === previousMs
          ? 0
          : 1_000 / (monotonicMs - previousMs);
      this.acceptedFrames += 1;
      this.frameId += 1;

      const timePoint = this.timeline.at(monotonicMs);
      await this.consumer.consume({
        frameId: this.frameId,
        bitmap,
        sourceWidth: this.video.videoWidth,
        sourceHeight: this.video.videoHeight,
        sessionElapsedMs: timePoint.sessionElapsedMs,
        clientMonotonicMs: timePoint.clientMonotonicMs,
        capturedAt: toIsoTimestamp(this.clock.wallClockNowMs()),
        targetFps: this.targetFps,
        actualFps: this.actualFps,
        performanceProfile: this.performanceProfile,
      });
    } finally {
      // After postMessage transfer this closes only the detached sender handle.
      bitmap?.close();
    }
  }

  private assertTargetFps(targetFps: number): void {
    if (!Number.isFinite(targetFps) || targetFps <= 0) {
      throw new RangeError("targetFps must be a positive finite number");
    }
  }
}
