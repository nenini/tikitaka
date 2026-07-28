import type { FaceQualityRuntimeStatus } from "../detectors/FaceQualityDetector.js";
import type { VisionEvent } from "../events/VisionEvent.js";
import type {
  VisionEventPublisher,
  VisionPublishResult,
} from "../events/VisionEventPublisher.js";
import type { FrameSamplerStats } from "./FrameSampler.js";
import type { NormalizedFaceFrame } from "./NormalizedFaceFrame.js";
import type {
  PerformanceGovernor,
  PerformanceGovernorDecision,
} from "./PerformanceGovernor.js";
import type {
  VisionPipeline,
  VisionPipelineOutput,
} from "./VisionPipeline.js";

export type VisionSessionEndReason = "CONSENT_WITHDRAWN" | "SESSION_ENDED";
export type VisionSessionRuntimeState = "ACTIVE" | "ENDING" | "ENDED";

export interface VisionSamplerControl {
  stop(): void;
  setPerformanceProfile(
    profile: PerformanceGovernorDecision["profile"],
    targetFps: number,
  ): void;
  getStats(): FrameSamplerStats;
}

export interface VisionSessionDisposable {
  dispose(): void | Promise<void>;
}

export interface VisionSessionFrameResult {
  readonly pipeline: VisionPipelineOutput;
  readonly performance: PerformanceGovernorDecision;
  readonly publishResult: VisionPublishResult | null;
  /** Transport errors are isolated so vision analysis cannot end the call. */
  readonly publishFailed: boolean;
}

export interface VisionSessionEndResult {
  readonly finalEvents: readonly VisionEvent[];
  readonly cleanupFailures: readonly (
    | "PIPELINE"
    | "PUBLISHER"
    | "RESOURCE"
  )[];
}

/**
 * Owns the state that must not cross a consent or session boundary.
 *
 * The WebRTC stream itself is intentionally not owned here. Passed resources
 * should be analysis-only wrappers such as BrowserMediaSource and Worker clients.
 */
export class VisionSessionRuntime {
  private state: VisionSessionRuntimeState = "ACTIVE";
  private lastDroppedFrames = 0;
  private readonly inFlightFrames = new Set<Promise<VisionSessionFrameResult>>();
  private endOperation: Promise<VisionSessionEndResult> | null = null;

  constructor(
    private readonly pipeline: VisionPipeline,
    private readonly publisher: VisionEventPublisher,
    private readonly governor: PerformanceGovernor,
    private readonly sampler: VisionSamplerControl,
    private readonly resources: readonly VisionSessionDisposable[] = [],
  ) {}

  process(
    frame: NormalizedFaceFrame,
    runtime?: FaceQualityRuntimeStatus,
  ): Promise<VisionSessionFrameResult> {
    if (this.state !== "ACTIVE") {
      return Promise.reject(new Error("VisionSessionRuntime is not active"));
    }

    const operation = this.processFrame(frame, runtime);
    this.inFlightFrames.add(operation);
    void operation.then(
      () => this.inFlightFrames.delete(operation),
      () => this.inFlightFrames.delete(operation),
    );
    return operation;
  }

  end(
    reason: VisionSessionEndReason,
    timePoint: {
      readonly sessionElapsedMs: number;
      readonly clientMonotonicMs: number;
    },
  ): Promise<VisionSessionEndResult> {
    if (this.endOperation !== null) return this.endOperation;
    this.state = "ENDING";
    this.sampler.stop();
    this.endOperation = this.finishEnd(reason, timePoint);
    return this.endOperation;
  }

  getState(): VisionSessionRuntimeState {
    return this.state;
  }

  private async processFrame(
    frame: NormalizedFaceFrame,
    runtime?: FaceQualityRuntimeStatus,
  ): Promise<VisionSessionFrameResult> {
    this.recordNewDroppedFrames();
    const pipelineOutput = this.pipeline.process(frame, runtime);
    const performance = this.governor.update({
      clientMonotonicMs: frame.clientMonotonicMs,
      processingDurationMs: frame.processing.totalDurationMs,
    });
    if (performance.changed) {
      this.sampler.setPerformanceProfile(
        performance.profile,
        performance.targetFps,
      );
    }

    try {
      const publishResult =
        pipelineOutput.events.length === 0
          ? null
          : await this.publisher.publish(pipelineOutput.events);
      return {
        pipeline: pipelineOutput,
        performance,
        publishResult,
        publishFailed: false,
      };
    } catch {
      // The publisher retains retryable batches; inference can continue locally.
      return {
        pipeline: pipelineOutput,
        performance,
        publishResult: null,
        publishFailed: true,
      };
    }
  }

  private async finishEnd(
    reason: VisionSessionEndReason,
    timePoint: {
      readonly sessionElapsedMs: number;
      readonly clientMonotonicMs: number;
    },
  ): Promise<VisionSessionEndResult> {
    const failures: Array<"PIPELINE" | "PUBLISHER" | "RESOURCE"> = [];
    let finalEvents: readonly VisionEvent[] = [];

    // Stopping sampling prevents new work; waiting here prevents an older frame
    // from publishing after the consent boundary has been closed.
    await Promise.allSettled([...this.inFlightFrames]);
    this.recordNewDroppedFrames();

    try {
      finalEvents = this.pipeline.endSession(reason, timePoint).events;
    } catch {
      failures.push("PIPELINE");
      // A faulty detector must not block the remaining privacy cleanup.
      try {
        this.pipeline.reset();
      } catch {
        // Reset failure is already represented by the pipeline cleanup failure.
      }
    }

    try {
      if (reason === "SESSION_ENDED") {
        if (finalEvents.length > 0) await this.publisher.publish(finalEvents);
        await this.publisher.close({ flush: true });
      } else {
        // Consent withdrawal takes effect before transport: pending and final
        // events are discarded locally rather than sent after withdrawal.
        await this.publisher.close({ flush: false });
      }
    } catch {
      failures.push("PUBLISHER");
    }

    for (const resource of this.resources) {
      try {
        await resource.dispose();
      } catch {
        failures.push("RESOURCE");
      }
    }

    this.governor.reset();
    this.lastDroppedFrames = 0;
    this.state = "ENDED";
    return { finalEvents, cleanupFailures: failures };
  }

  private recordNewDroppedFrames(): void {
    const droppedFrames = this.sampler.getStats().droppedFrames;
    const delta =
      droppedFrames >= this.lastDroppedFrames
        ? droppedFrames - this.lastDroppedFrames
        : droppedFrames;
    if (delta > 0) this.pipeline.recordDroppedFrame(delta);
    this.lastDroppedFrames = droppedFrames;
  }
}
