/// <reference lib="webworker" />

import { SystemClock } from "../../common/Clock.js";
import { FaceFrameNormalizer, selectPrimaryFaceBox } from "../core/FaceFrameNormalizer.js";
import { FaceLandmarkerAdapter } from "../core/FaceLandmarkerAdapter.js";
import { FrameQualityAnalyzer } from "../core/FrameQualityAnalyzer.js";
import type {
  VisionWorkerRequest,
  VisionWorkerResponse,
} from "./visionWorkerMessages.js";

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
const clock = new SystemClock();
const normalizer = new FaceFrameNormalizer();
let adapter: FaceLandmarkerAdapter | null = null;
let analysisCanvas: OffscreenCanvas | null = null;
let analysisContext: OffscreenCanvasRenderingContext2D | null = null;
let qualityAnalyzer: FrameQualityAnalyzer | null = null;

function respond(response: VisionWorkerResponse): void {
  scope.postMessage(response);
}

async function initialize(
  request: Extract<VisionWorkerRequest, { readonly type: "INITIALIZE" }>,
): Promise<void> {
  adapter?.close();
  normalizer.reset();

  try {
    analysisCanvas = new OffscreenCanvas(
      request.config.frame.analysisWidth,
      request.config.frame.analysisHeight,
    );
    analysisContext = analysisCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (analysisContext === null) {
      throw new Error("OffscreenCanvas 2D context is unavailable");
    }

    qualityAnalyzer = new FrameQualityAnalyzer({
      faceRoiPaddingRatio: request.config.frame.faceRoiPaddingRatio,
      blurVarianceFloor: request.config.frame.blurVarianceFloor,
      blurVarianceCeiling: request.config.frame.blurVarianceCeiling,
    });
    adapter = await FaceLandmarkerAdapter.create(
      {
        model: request.config.model,
        gpuCanvas: new OffscreenCanvas(1, 1),
      },
      clock,
    );
    respond({ type: "READY", delegate: adapter.delegate });
  } catch (error: unknown) {
    adapter = null;
    respond({
      type: "FATAL_ERROR",
      code: "INITIALIZATION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Vision Worker initialization failed",
      recoverable: false,
      frameId: null,
    });
  }
}

function processFrame(
  request: Extract<VisionWorkerRequest, { readonly type: "PROCESS_FRAME" }>,
): void {
  const frame = request.frame;
  const currentAdapter = adapter;
  const canvas = analysisCanvas;
  const context = analysisContext;
  const analyzer = qualityAnalyzer;

  if (
    currentAdapter === null ||
    canvas === null ||
    context === null ||
    analyzer === null
  ) {
    frame.bitmap.close();
    respond({
      type: "FRAME_ERROR",
      code: "NOT_INITIALIZED",
      message: "Vision Worker is not initialized",
      recoverable: false,
      frameId: frame.frameId,
    });
    return;
  }

  const startedAtMs = clock.monotonicNowMs();
  try {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);

    const landmarkerResult = currentAdapter.detect(
      canvas,
      frame.clientMonotonicMs,
    );
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const imageQuality = analyzer.analyze(
      imageData,
      selectPrimaryFaceBox(landmarkerResult),
    );
    const normalizedFrame = normalizer.normalize({
      frameId: frame.frameId,
      sessionElapsedMs: frame.sessionElapsedMs,
      clientMonotonicMs: frame.clientMonotonicMs,
      capturedAt: frame.capturedAt,
      sourceWidth: frame.sourceWidth,
      sourceHeight: frame.sourceHeight,
      brightnessScore: imageQuality.brightnessScore,
      backlightScore: imageQuality.backlightScore,
      blurScore: imageQuality.blurScore,
      rawLaplacianVariance: imageQuality.rawLaplacianVariance,
      totalDurationMs: clock.monotonicNowMs() - startedAtMs,
      targetFps: frame.targetFps,
      actualFps: frame.actualFps,
      performanceProfile: frame.performanceProfile,
      landmarkerResult,
    });

    respond({ type: "FRAME_RESULT", frame: normalizedFrame });
  } catch (error: unknown) {
    respond({
      type: "FRAME_ERROR",
      code: "INFERENCE_FAILED",
      message:
        error instanceof Error ? error.message : "Vision frame inference failed",
      recoverable: true,
      frameId: frame.frameId,
    });
  } finally {
    // The Worker owns the transferred bitmap and must release its GPU resource.
    frame.bitmap.close();
  }
}

function dispose(): void {
  adapter?.close();
  adapter = null;
  analysisCanvas = null;
  analysisContext = null;
  qualityAnalyzer = null;
  normalizer.reset();
  respond({ type: "DISPOSED" });
}

scope.addEventListener("message", (event: MessageEvent<VisionWorkerRequest>) => {
  switch (event.data.type) {
    case "INITIALIZE":
      void initialize(event.data);
      break;
    case "PROCESS_FRAME":
      processFrame(event.data);
      break;
    case "DISPOSE":
      dispose();
      break;
  }
});
