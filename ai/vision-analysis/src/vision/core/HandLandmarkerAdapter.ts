import {
  FilesetResolver,
  HandLandmarker,
  type ImageSource,
} from "@mediapipe/tasks-vision";

import type { Clock } from "../../common/Clock.js";
import type { VisionConfig } from "../config/VisionConfig.js";
import type {
  HandLandmarkerFrameResult,
  LandmarkerHandResult,
} from "./HandLandmarkerFrameResult.js";

export interface HandLandmarkerAdapterOptions {
  readonly wasmBasePath: string;
  readonly model: VisionConfig["handModel"];
  readonly gpuCanvas?: OffscreenCanvas;
}

/** Keeps MediaPipe-specific hand types inside one small adapter boundary. */
export class HandLandmarkerAdapter {
  private lastTimestampMs: number | null = null;

  private constructor(
    private readonly task: HandLandmarker,
    private readonly clock: Clock,
    readonly delegate: "GPU" | "CPU",
  ) {}

  static async create(
    options: HandLandmarkerAdapterOptions,
    clock: Clock,
  ): Promise<HandLandmarkerAdapter> {
    const resolvedFileset = await FilesetResolver.forVisionTasks(
      options.wasmBasePath,
      true,
    );
    /**
     * MediaPipe's ES-module loader stores ModuleFactory in module scope. When
     * Face and Hand tasks use the exact same loader URL in one Worker, the
     * browser reuses the first imported module and the second task can fail
     * with "ModuleFactory not set". A task-specific query creates a separate
     * module instance while still downloading the same locally cached asset.
     */
    const loaderUrl = new URL(
      resolvedFileset.wasmLoaderPath,
      globalThis.location?.href,
    );
    loaderUrl.searchParams.set("task", "hand");
    const fileset = {
      ...resolvedFileset,
      wasmLoaderPath: loaderUrl.href,
    };

    const createTask = async (
      delegate: "GPU" | "CPU",
    ): Promise<HandLandmarker> =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: options.model.modelAssetPath,
          delegate,
        },
        runningMode: "VIDEO",
        numHands: options.model.numHands,
        minHandDetectionConfidence:
          options.model.minHandDetectionConfidence,
        minHandPresenceConfidence:
          options.model.minHandPresenceConfidence,
        minTrackingConfidence: options.model.minTrackingConfidence,
        ...(delegate === "GPU" && options.gpuCanvas !== undefined
          ? { canvas: options.gpuCanvas }
          : {}),
      });

    if (options.model.preferredDelegate === "GPU") {
      try {
        return new HandLandmarkerAdapter(
          await createTask("GPU"),
          clock,
          "GPU",
        );
      } catch (gpuError: unknown) {
        try {
          return new HandLandmarkerAdapter(
            await createTask("CPU"),
            clock,
            "CPU",
          );
        } catch (cpuError: unknown) {
          const describe = (error: unknown): string =>
            error instanceof Error ? error.message : String(error);
          throw new AggregateError(
            [gpuError, cpuError],
            `Hand Landmarker failed with both delegates. GPU: ${describe(gpuError)}; CPU: ${describe(cpuError)}`,
          );
        }
      }
    }

    return new HandLandmarkerAdapter(
      await createTask("CPU"),
      clock,
      "CPU",
    );
  }

  detect(image: ImageSource, timestampMs: number): HandLandmarkerFrameResult {
    if (
      this.lastTimestampMs !== null &&
      timestampMs <= this.lastTimestampMs
    ) {
      throw new RangeError(
        "MediaPipe hand video timestamps must increase monotonically",
      );
    }
    this.lastTimestampMs = timestampMs;

    const startedAtMs = this.clock.monotonicNowMs();
    const rawResult = this.task.detectForVideo(image, timestampMs);
    const inferenceDurationMs =
      this.clock.monotonicNowMs() - startedAtMs;

    const hands: LandmarkerHandResult[] = rawResult.landmarks.map(
      (landmarks, index) => {
        const category = rawResult.handedness[index]?.[0];
        const normalizedName = category?.categoryName.toUpperCase();
        const handedness =
          normalizedName === "LEFT" || normalizedName === "RIGHT"
            ? normalizedName
            : "UNKNOWN";
        return {
          landmarks: landmarks.map((landmark) => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
          })),
          handedness,
          handednessConfidence: category?.score ?? 0,
        };
      },
    );

    return { hands, inferenceDurationMs };
  }

  close(): void {
    this.task.close();
    this.lastTimestampMs = null;
  }
}
