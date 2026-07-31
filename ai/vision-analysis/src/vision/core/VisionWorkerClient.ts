import type { FrameSampleConsumer, SampledVideoFrame } from "./FrameSampler.js";
import type { NormalizedFaceFrame } from "./NormalizedFaceFrame.js";
import type { VisionConfig } from "../config/VisionConfig.js";
import {
  isVisionWorkerResponse,
  type VisionWorkerRequest,
} from "../workers/visionWorkerMessages.js";

export type VisionFrameResultListener = (frame: NormalizedFaceFrame) => void;
export type VisionWorkerFailureListener = (error: Error) => void;

interface WorkerPort {
  postMessage(message: VisionWorkerRequest, transfer: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

interface PendingOperation<TValue> {
  readonly resolve: (value: TValue) => void;
  readonly reject: (reason: Error) => void;
}

/** Main-thread owner of the one-frame-at-a-time Worker protocol. */
export class VisionWorkerClient implements FrameSampleConsumer {
  private initialized = false;
  private disposed = false;
  private initialization: PendingOperation<void> | null = null;
  private pendingFrame: PendingOperation<NormalizedFaceFrame> | null = null;
  private disposal: PendingOperation<void> | null = null;
  private initializationTimer: ReturnType<typeof setTimeout> | null = null;
  private delegate: "GPU" | "CPU" | null = null;
  private handDelegate: "GPU" | "CPU" | null = null;

  constructor(
    private readonly worker: WorkerPort,
    private readonly onFrameResult: VisionFrameResultListener,
    private readonly onFatalError: VisionWorkerFailureListener = () => undefined,
  ) {
    worker.addEventListener("message", this.handleMessage);
    worker.addEventListener("error", this.handleWorkerError);
  }

  initialize(
    config: Pick<VisionConfig, "model" | "handModel" | "frame" | "worker">,
  ): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error("VisionWorkerClient is disposed"));
    }
    if (this.initialized) {
      return Promise.resolve();
    }
    if (this.initialization !== null) {
      return Promise.reject(new Error("Worker initialization is already pending"));
    }

    return new Promise<void>((resolve, reject) => {
      this.initialization = { resolve, reject };
      this.initializationTimer = setTimeout(() => {
        const error = new Error("Vision Worker initialization timed out");
        this.initializationTimer = null;
        this.initialization = null;
        this.disposed = true;
        this.detachAndTerminate();
        reject(error);
        this.onFatalError(error);
      }, config.worker.initializationTimeoutMs);
      try {
        this.worker.postMessage(
          {
            type: "INITIALIZE",
            config: {
              model: config.model,
              handModel: config.handModel,
              frame: config.frame,
            },
          },
          [],
        );
      } catch (error: unknown) {
        this.clearInitializationTimer();
        this.initialization = null;
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to initialize Vision Worker"),
        );
      }
    });
  }

  async consume(frame: SampledVideoFrame): Promise<void> {
    const result = await this.processFrame(frame);
    this.onFrameResult(result);
  }

  processFrame(frame: SampledVideoFrame): Promise<NormalizedFaceFrame> {
    if (!this.initialized || this.disposed) {
      return Promise.reject(new Error("Vision Worker is not ready"));
    }
    if (this.pendingFrame !== null) {
      return Promise.reject(new Error("A vision frame is already in flight"));
    }

    return new Promise<NormalizedFaceFrame>((resolve, reject) => {
      this.pendingFrame = { resolve, reject };
      try {
        // Transfer moves bitmap ownership to the Worker without copying pixels.
        this.worker.postMessage({ type: "PROCESS_FRAME", frame }, [frame.bitmap]);
      } catch (error: unknown) {
        this.pendingFrame = null;
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to transfer frame to Vision Worker"),
        );
      }
    });
  }

  dispose(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    if (this.disposal !== null) {
      return Promise.reject(new Error("Worker disposal is already pending"));
    }

    return new Promise<void>((resolve, reject) => {
      this.disposal = { resolve, reject };
      try {
        this.worker.postMessage({ type: "DISPOSE" }, []);
      } catch (error: unknown) {
        this.disposal = null;
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to dispose Vision Worker"),
        );
      }
    });
  }

  /** The actual delegate may differ from preference after GPU fallback. */
  getDelegate(): "GPU" | "CPU" | null {
    return this.delegate;
  }

  /** The hand task may independently fall back from GPU to CPU. */
  getHandDelegate(): "GPU" | "CPU" | null {
    return this.handDelegate;
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isVisionWorkerResponse(event.data)) {
      this.failAll(new Error("Vision Worker returned an invalid message"));
      return;
    }

    switch (event.data.type) {
      case "READY":
        this.clearInitializationTimer();
        this.initialized = true;
        this.delegate = event.data.delegate;
        this.handDelegate = event.data.handDelegate;
        this.initialization?.resolve();
        this.initialization = null;
        break;
      case "FRAME_RESULT":
        this.pendingFrame?.resolve(event.data.frame);
        this.pendingFrame = null;
        break;
      case "FRAME_ERROR":
        this.pendingFrame?.reject(new Error(event.data.message));
        this.pendingFrame = null;
        break;
      case "FATAL_ERROR":
        this.handleFatalError(new Error(event.data.message));
        break;
      case "DISPOSED":
        this.disposed = true;
        this.initialized = false;
        this.delegate = null;
        this.handDelegate = null;
        this.disposal?.resolve();
        this.disposal = null;
        this.detachAndTerminate();
        break;
    }
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    this.handleFatalError(
      new Error(event.message || "Vision Worker runtime error"),
    );
  };

  private handleFatalError(error: Error): void {
    this.failAll(error);
    this.disposed = true;
    this.detachAndTerminate();
    // The owner may create a fresh client up to config.maximumRestartAttempts.
    this.onFatalError(error);
  }

  private failAll(error: Error): void {
    this.clearInitializationTimer();
    this.initialization?.reject(error);
    this.pendingFrame?.reject(error);
    this.disposal?.reject(error);
    this.initialization = null;
    this.pendingFrame = null;
    this.disposal = null;
    this.initialized = false;
    this.delegate = null;
    this.handDelegate = null;
  }

  private clearInitializationTimer(): void {
    if (this.initializationTimer !== null) {
      clearTimeout(this.initializationTimer);
      this.initializationTimer = null;
    }
  }

  private detachAndTerminate(): void {
    this.clearInitializationTimer();
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleWorkerError);
    this.worker.terminate();
  }
}

/** Creates the module Worker expected by Vite without starting camera access. */
export function createVisionWorkerClient(
  workerUrl: URL,
  onFrameResult: VisionFrameResultListener,
  onFatalError: VisionWorkerFailureListener = () => undefined,
): VisionWorkerClient {
  const worker = new Worker(workerUrl, { type: "module" });
  return new VisionWorkerClient(worker, onFrameResult, onFatalError);
}

/** Uses the Worker module shipped with this package; Vite resolves this URL. */
export function createBundledVisionWorkerClient(
  onFrameResult: VisionFrameResultListener,
  onFatalError: VisionWorkerFailureListener = () => undefined,
): VisionWorkerClient {
  // Keep Worker(new URL(...)) in one expression so Vite bundles its imports.
  const worker = new Worker(
    new URL("../workers/vision.worker.js", import.meta.url),
    { type: "module" },
  );
  return new VisionWorkerClient(worker, onFrameResult, onFatalError);
}
