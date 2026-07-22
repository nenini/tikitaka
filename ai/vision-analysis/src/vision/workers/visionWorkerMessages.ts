import type { SampledVideoFrame } from "../core/FrameSampler.js";
import type { NormalizedFaceFrame } from "../core/NormalizedFaceFrame.js";
import type { VisionConfig } from "../config/VisionConfig.js";

export interface InitializeVisionWorkerRequest {
  readonly type: "INITIALIZE";
  readonly config: Pick<VisionConfig, "model" | "frame">;
}

export interface ProcessVisionFrameRequest {
  readonly type: "PROCESS_FRAME";
  readonly frame: SampledVideoFrame;
}

export interface DisposeVisionWorkerRequest {
  readonly type: "DISPOSE";
}

export type VisionWorkerRequest =
  | InitializeVisionWorkerRequest
  | ProcessVisionFrameRequest
  | DisposeVisionWorkerRequest;

export interface VisionWorkerReadyResponse {
  readonly type: "READY";
  readonly delegate: "GPU" | "CPU";
}

export interface VisionWorkerFrameResultResponse {
  readonly type: "FRAME_RESULT";
  readonly frame: NormalizedFaceFrame;
}

export interface VisionWorkerErrorResponse {
  readonly type: "FRAME_ERROR" | "FATAL_ERROR";
  readonly code:
    | "NOT_INITIALIZED"
    | "INITIALIZATION_FAILED"
    | "INFERENCE_FAILED"
    | "WORKER_RUNTIME_ERROR";
  readonly message: string;
  readonly recoverable: boolean;
  readonly frameId: number | null;
}

export interface VisionWorkerDisposedResponse {
  readonly type: "DISPOSED";
}

export type VisionWorkerResponse =
  | VisionWorkerReadyResponse
  | VisionWorkerFrameResultResponse
  | VisionWorkerErrorResponse
  | VisionWorkerDisposedResponse;

/** Minimal runtime guard for messages crossing the untyped Worker boundary. */
export function isVisionWorkerResponse(
  value: unknown,
): value is VisionWorkerResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const type = Reflect.get(value, "type");
  return (
    type === "READY" ||
    type === "FRAME_RESULT" ||
    type === "FRAME_ERROR" ||
    type === "FATAL_ERROR" ||
    type === "DISPOSED"
  );
}

