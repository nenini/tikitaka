import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MonotonicSequenceGenerator } from "../../src/common/SequenceGenerator.js";
import { SessionTimeline } from "../../src/common/SessionTimeline.js";
import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { visionConfigSchema } from "../../src/vision/config/VisionConfig.js";
import type { NormalizedFaceFrame } from "../../src/vision/core/NormalizedFaceFrame.js";
import { VisionPipeline } from "../../src/vision/core/VisionPipeline.js";
import type {
  DetectorSuspensionContext,
  VisionDetector,
  VisionDetectorContext,
} from "../../src/vision/detectors/VisionDetector.js";
import type { VisionBehaviorEvent } from "../../src/vision/events/VisionEvent.js";
import { visionEventSchema } from "../../src/vision/events/VisionEventSchema.js";
import { VisionEventFactory } from "../../src/vision/events/VisionEventFactory.js";
import { createNormalizedFaceFrame } from "../helpers/createNormalizedFaceFrame.js";
import { MutableClock } from "../helpers/MutableClock.js";

class RecordingDetector
  implements VisionDetector<NormalizedFaceFrame, object>
{
  updateCalls = 0;
  suspendCalls = 0;
  resetCalls = 0;

  constructor(
    readonly name: string,
    private readonly throwsOnUpdate = false,
  ) {}

  update(
    _frame: NormalizedFaceFrame,
    _context: VisionDetectorContext,
  ): readonly VisionBehaviorEvent[] {
    this.updateCalls += 1;
    if (this.throwsOnUpdate) throw new Error("synthetic detector failure");
    return [];
  }

  suspend(
    _context: DetectorSuspensionContext,
  ): readonly VisionBehaviorEvent[] {
    this.suspendCalls += 1;
    return [];
  }

  reset(): void {
    this.resetCalls += 1;
  }

  getState(): object {
    return {};
  }
}

function createFactory(): VisionEventFactory {
  const clock = new MutableClock();
  return new VisionEventFactory(
    {
      sessionId: "pipeline-session",
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
  );
}

describe("VisionPipeline", () => {
  it("isolates one detector failure and limits metrics to once per second", () => {
    const screen = new RecordingDetector("screen");
    const smile = new RecordingDetector("smile", true);
    const activity = new RecordingDetector("activity");
    const nod = new RecordingDetector("nod");
    const pipeline = new VisionPipeline(defaultVisionConfig, createFactory(), {
      detectorOverrides: {
        screenAttention: screen,
        smileExpression: smile,
        expressionActivity: activity,
        nod,
      },
    });

    const first = pipeline.process(createNormalizedFaceFrame({ timestampMs: 0 }));
    const middle = pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 999 }),
    );
    pipeline.recordDroppedFrame(2);
    const next = pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 1_000 }),
    );

    expect(first.metricSnapshot?.sessionElapsedMs).toBe(0);
    expect(middle.metricSnapshot).toBeNull();
    expect(next.metricSnapshot?.sessionElapsedMs).toBe(1_000);
    expect(
      next.metricSnapshot?.payload.performance.droppedFramesSinceLastSnapshot,
    ).toBe(2);
    expect(first.detectorErrors).toEqual([
      { detectorName: "smile", phase: "UPDATE" },
    ]);
    expect(
      first.metricSnapshot?.payload.capabilities.activeDetectors,
    ).not.toContain("SMILE_EXPRESSION");
    expect(activity.updateCalls).toBe(3);
    expect(smile.resetCalls).toBe(3);
    for (const event of [...first.events, ...next.events]) {
      expect(visionEventSchema.parse(event)).toEqual(event);
      expect(JSON.stringify(event)).not.toContain("blendshapes");
      expect(JSON.stringify(event)).not.toContain("landmarkDisplacementScore");
    }
  });

  it("runs quality first and suspends every behavior detector when unusable", () => {
    const config = visionConfigSchema.parse({
      ...structuredClone(defaultVisionConfig),
      quality: {
        ...structuredClone(defaultVisionConfig.quality),
        faceMissingEntryDurationMs: 100,
      },
    });
    const detectors = {
      screenAttention: new RecordingDetector("screen"),
      smileExpression: new RecordingDetector("smile"),
      expressionActivity: new RecordingDetector("activity"),
      nod: new RecordingDetector("nod"),
    };
    const pipeline = new VisionPipeline(config, createFactory(), {
      detectorOverrides: detectors,
      enabledDetectorOverrides: { NOD: true },
    });

    pipeline.process(createNormalizedFaceFrame({ timestampMs: 0 }));
    pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 100, faceDetected: false }),
    );
    const unavailable = pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 200, faceDetected: false }),
    );

    expect(unavailable.quality.usable).toBe(false);
    expect(unavailable.behaviorEvents.map((event) => event.eventType)).toEqual([
      "FACE_MISSING_STARTED",
      "ANALYSIS_UNAVAILABLE",
    ]);
    expect(
      unavailable.behaviorEvents.map((event) => event.sessionElapsedMs),
    ).toEqual([200, 200]);
    expect(
      unavailable.behaviorEvents[1]?.seq,
    ).toBeGreaterThan(unavailable.behaviorEvents[0]?.seq ?? 0);
    expect(detectors.screenAttention.updateCalls).toBe(2);
    expect(detectors.smileExpression.updateCalls).toBe(2);
    expect(detectors.expressionActivity.updateCalls).toBe(2);
    expect(detectors.nod.updateCalls).toBe(2);
    expect(detectors.screenAttention.suspendCalls).toBe(1);
    expect(detectors.smileExpression.suspendCalls).toBe(1);
    expect(detectors.expressionActivity.suspendCalls).toBe(1);
    expect(detectors.nod.suspendCalls).toBe(1);
  });

  it("separates observed time from frame gaps and reports configured versus active detectors", () => {
    const pipeline = new VisionPipeline(
      defaultVisionConfig,
      createFactory(),
    );

    pipeline.process(createNormalizedFaceFrame({ timestampMs: 0 }));
    pipeline.process(createNormalizedFaceFrame({ timestampMs: 200 }));
    pipeline.process(createNormalizedFaceFrame({ timestampMs: 400 }));
    const snapshot = pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 1_000 }),
    ).metricSnapshot;

    expect(snapshot?.payload.observationInterval).toEqual({
      startedAtSessionElapsedMs: 0,
      endedAtSessionElapsedMs: 1_000,
      observedDurationMs: 400,
    });
    expect(snapshot?.payload.capabilities.configuredDetectors).toContain(
      "NOD",
    );
    expect(snapshot?.payload.capabilities.activeDetectors).not.toContain(
      "NOD",
    );
  });

  it("reports only quality and attention as configured in the LOW profile", () => {
    const pipeline = new VisionPipeline(
      defaultVisionConfig,
      createFactory(),
    );
    const highFrame = createNormalizedFaceFrame({ timestampMs: 0 });
    const lowFrame: NormalizedFaceFrame = {
      ...highFrame,
      processing: {
        ...highFrame.processing,
        performanceProfile: "LOW",
        targetFps: 1.5,
        actualFps: 1.5,
      },
    };

    const snapshot = pipeline.process(lowFrame).metricSnapshot;

    expect(snapshot?.payload.capabilities).toEqual({
      configuredDetectors: ["FACE_QUALITY", "SCREEN_ATTENTION"],
      activeDetectors: ["FACE_QUALITY", "SCREEN_ATTENTION"],
    });
    expect(snapshot?.payload.metrics.smile.configurationScore).toBeNull();
  });

  it("uses the first vision frame instead of session zero for the first metric interval", () => {
    const pipeline = new VisionPipeline(
      defaultVisionConfig,
      createFactory(),
    );

    const snapshot = pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 180_000 }),
    ).metricSnapshot;

    expect(snapshot?.payload.observationInterval).toEqual({
      startedAtSessionElapsedMs: 180_000,
      endedAtSessionElapsedMs: 180_000,
      observedDurationMs: 0,
    });
  });

  it("counts normal 1.5 FPS LOW-profile intervals as observed time", () => {
    const pipeline = new VisionPipeline(
      defaultVisionConfig,
      createFactory(),
    );
    const lowFrame = (timestampMs: number): NormalizedFaceFrame => {
      const frame = createNormalizedFaceFrame({ timestampMs });
      return {
        ...frame,
        processing: {
          ...frame.processing,
          performanceProfile: "LOW",
          targetFps: 1.5,
          actualFps: 1.5,
        },
      };
    };

    pipeline.process(lowFrame(0));
    pipeline.process(lowFrame(667));
    const snapshot = pipeline.process(lowFrame(1_334)).metricSnapshot;

    expect(snapshot?.payload.observationInterval).toEqual({
      startedAtSessionElapsedMs: 0,
      endedAtSessionElapsedMs: 1_334,
      observedDurationMs: 1_334,
    });
  });

  it("does not count camera-disabled intervals as observed time", () => {
    const pipeline = new VisionPipeline(
      defaultVisionConfig,
      createFactory(),
    );
    const cameraDisabled = {
      cameraEnabled: false,
      trackEnded: false,
      videoDimensionsAvailable: true,
      tabVisible: true,
      landmarkerAvailable: true,
      workerHealthy: true,
    } as const;

    pipeline.process(createNormalizedFaceFrame({ timestampMs: 0 }));
    pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 200 }),
      cameraDisabled,
    );
    pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 400 }),
      cameraDisabled,
    );
    const snapshot = pipeline.process(
      createNormalizedFaceFrame({ timestampMs: 1_000 }),
      cameraDisabled,
    ).metricSnapshot;

    expect(snapshot?.payload.observationInterval).toEqual({
      startedAtSessionElapsedMs: 0,
      endedAtSessionElapsedMs: 1_000,
      observedDurationMs: 0,
    });
    expect(snapshot?.payload.capabilities.activeDetectors).toEqual([]);
  });
});
