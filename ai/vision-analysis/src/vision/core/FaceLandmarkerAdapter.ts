import {
  FaceLandmarker,
  FilesetResolver,
  type ImageSource,
} from "@mediapipe/tasks-vision";

import type { Clock } from "../../common/Clock.js";
import type { VisionConfig } from "../config/VisionConfig.js";
import type {
  FacialTransformMatrix,
  LandmarkerFaceResult,
  LandmarkerFrameResult,
} from "./LandmarkerFrameResult.js";

export interface FaceLandmarkerAdapterOptions {
  readonly model: VisionConfig["model"];
  readonly gpuCanvas?: OffscreenCanvas;
}

/**
 * Owns the MediaPipe task and immediately converts its result to local types.
 * Keeping this import boundary small prevents vendor types from leaking into
 * detector and event code.
 */
export class FaceLandmarkerAdapter {
  private lastTimestampMs: number | null = null;

  private constructor(
    private readonly task: FaceLandmarker,
    private readonly clock: Clock,
    readonly delegate: "GPU" | "CPU",
  ) {}

  static async create(
    options: FaceLandmarkerAdapterOptions,
    clock: Clock,
  ): Promise<FaceLandmarkerAdapter> {
    const fileset = await FilesetResolver.forVisionTasks(
      options.model.wasmBasePath,
      // The adapter runs in an ES module Worker, so load MediaPipe's module glue.
      true,
    );

    const createTask = async (
      delegate: "GPU" | "CPU",
    ): Promise<FaceLandmarker> =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: options.model.modelAssetPath,
          delegate,
        },
        runningMode: "VIDEO",
        numFaces: options.model.numFaces,
        minFaceDetectionConfidence:
          options.model.minFaceDetectionConfidence,
        minFacePresenceConfidence: options.model.minFacePresenceConfidence,
        minTrackingConfidence: options.model.minTrackingConfidence,
        outputFaceBlendshapes: options.model.outputFaceBlendshapes,
        outputFacialTransformationMatrixes:
          options.model.outputFacialTransformationMatrixes,
        ...(delegate === "GPU" && options.gpuCanvas !== undefined
          ? { canvas: options.gpuCanvas }
          : {}),
      });

    if (options.model.preferredDelegate === "GPU") {
      try {
        return new FaceLandmarkerAdapter(await createTask("GPU"), clock, "GPU");
      } catch (gpuError: unknown) {
        try {
          return new FaceLandmarkerAdapter(
            await createTask("CPU"),
            clock,
            "CPU",
          );
        } catch (cpuError: unknown) {
          const describe = (error: unknown): string =>
            error instanceof Error ? error.message : String(error);
          throw new AggregateError(
            [gpuError, cpuError],
            `Face Landmarker failed with both delegates. GPU: ${describe(gpuError)}; CPU: ${describe(cpuError)}`,
          );
        }
      }
    }

    return new FaceLandmarkerAdapter(await createTask("CPU"), clock, "CPU");
  }

  detect(image: ImageSource, timestampMs: number): LandmarkerFrameResult {
    if (
      this.lastTimestampMs !== null &&
      timestampMs <= this.lastTimestampMs
    ) {
      throw new RangeError(
        "MediaPipe video timestamps must increase monotonically",
      );
    }
    this.lastTimestampMs = timestampMs;

    const startedAtMs = this.clock.monotonicNowMs();
    const rawResult = this.task.detectForVideo(image, timestampMs);
    const inferenceDurationMs =
      this.clock.monotonicNowMs() - startedAtMs;

    const faces: LandmarkerFaceResult[] = rawResult.faceLandmarks.map(
      (landmarks, index) => {
        const categories =
          rawResult.faceBlendshapes[index]?.categories ?? [];
        const blendshapes: Record<string, number> = {};
        for (const category of categories) {
          if (category.categoryName.length > 0) {
            blendshapes[category.categoryName] = category.score;
          }
        }

        const matrix = rawResult.facialTransformationMatrixes[index];
        const transformationMatrix: FacialTransformMatrix | null =
          matrix === undefined
            ? null
            : {
                rows: matrix.rows,
                columns: matrix.columns,
                data: [...matrix.data],
              };

        return {
          landmarks: landmarks.map((landmark) => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
          })),
          blendshapes: Object.freeze(blendshapes),
          transformationMatrix,
        };
      },
    );

    return { faces, inferenceDurationMs };
  }

  close(): void {
    this.task.close();
    this.lastTimestampMs = null;
  }
}
