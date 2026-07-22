import type { MediaStreamHealth } from "../../media/MediaStreamHealth.js";
import type { VisionConfig } from "../config/VisionConfig.js";
import {
  FACE_QUALITY_REASONS,
  type FaceQualityDecision,
  type FaceQualityReason,
  type NormalizedFaceFrame,
} from "../core/NormalizedFaceFrame.js";
import type { VisionBehaviorEvent } from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import {
  HysteresisGate,
  type HysteresisGateSnapshot,
  type HysteresisGateTransition,
} from "../filters/HysteresisGate.js";

const QUALITY_GATE_REASONS = [
  "FACE_MISSING",
  "MULTIPLE_FACES",
  "FACE_TOO_SMALL",
  "FACE_OUT_OF_FRAME",
  "LOW_LIGHT",
  "SEVERE_BLUR",
  "EXTREME_HEAD_POSE",
] as const;

type QualityGateReason = (typeof QUALITY_GATE_REASONS)[number];

export const FACE_QUALITY_STATES = [
  "USABLE",
  "UNUSABLE_CANDIDATE",
  "UNUSABLE",
  "RECOVERY_CANDIDATE",
] as const;

export type FaceQualityState = (typeof FACE_QUALITY_STATES)[number];

export interface FaceQualityRuntimeStatus {
  readonly cameraEnabled: boolean;
  readonly trackEnded: boolean;
  readonly videoDimensionsAvailable: boolean;
  readonly tabVisible: boolean;
  readonly landmarkerAvailable: boolean;
  readonly workerHealthy: boolean;
}

export interface FaceQualityDetectorState {
  readonly state: FaceQualityState;
  readonly activeReasons: readonly FaceQualityReason[];
  readonly unavailableSinceMs: number | null;
  readonly recoverySinceMs: number | null;
  readonly gates: Readonly<Record<QualityGateReason, HysteresisGateSnapshot>>;
}

export interface FaceQualityDetectorOutput {
  readonly decision: FaceQualityDecision;
  readonly events: readonly VisionBehaviorEvent[];
  readonly state: Readonly<FaceQualityDetectorState>;
}

const DEFAULT_RUNTIME_STATUS: FaceQualityRuntimeStatus = {
  cameraEnabled: true,
  trackEnded: false,
  videoDimensionsAvailable: true,
  tabVisible: true,
  landmarkerAvailable: true,
  workerHealthy: true,
};

/** Converts camera-track state into the detector's transport-free runtime input. */
export function mediaHealthToQualityRuntime(
  health: MediaStreamHealth,
): Pick<FaceQualityRuntimeStatus, "cameraEnabled" | "trackEnded"> {
  return {
    cameraEnabled: health.state === "READY",
    trackEnded: health.state === "TRACK_ENDED",
  };
}

/**
 * Quality gate that separates technical observability from user behavior.
 * Other behavior detectors must run only when `decision.usable` is true.
 */
export class FaceQualityDetector {
  readonly name = "FaceQualityDetector";

  private readonly gates: Record<QualityGateReason, HysteresisGate>;
  private readonly episodeIds = new Map<FaceQualityReason, string>();
  private state: FaceQualityState = "USABLE";
  private activeReasons: readonly FaceQualityReason[] = [];
  private unavailableSinceMs: number | null = null;
  private recoverySinceMs: number | null = null;
  private analysisEpisodeId: string | null = null;

  constructor(
    private readonly config: VisionConfig["quality"],
    private readonly eventFactory: VisionEventFactory,
  ) {
    this.gates = {
      FACE_MISSING: new HysteresisGate(
        config.faceMissingEntryDurationMs,
        config.faceMissingRecoveryDurationMs,
      ),
      MULTIPLE_FACES: new HysteresisGate(
        config.multipleFacesEntryDurationMs,
        config.multipleFacesRecoveryDurationMs,
      ),
      FACE_TOO_SMALL: new HysteresisGate(
        config.faceArea.entryDurationMs,
        config.faceArea.recoveryDurationMs,
      ),
      FACE_OUT_OF_FRAME: new HysteresisGate(
        config.faceInFrame.entryDurationMs,
        config.faceInFrame.recoveryDurationMs,
      ),
      LOW_LIGHT: new HysteresisGate(
        config.brightness.entryDurationMs,
        config.brightness.recoveryDurationMs,
      ),
      SEVERE_BLUR: new HysteresisGate(
        config.blur.entryDurationMs,
        config.blur.recoveryDurationMs,
      ),
      EXTREME_HEAD_POSE: new HysteresisGate(
        Math.max(
          config.extremeYaw.entryDurationMs,
          config.extremePitch.entryDurationMs,
          config.extremeRoll.entryDurationMs,
        ),
        Math.max(
          config.extremeYaw.recoveryDurationMs,
          config.extremePitch.recoveryDurationMs,
          config.extremeRoll.recoveryDurationMs,
        ),
      ),
    };
  }

  update(
    frame: NormalizedFaceFrame,
    runtime: FaceQualityRuntimeStatus = DEFAULT_RUNTIME_STATUS,
  ): FaceQualityDetectorOutput {
    const timestampMs = frame.sessionElapsedMs;
    const events: VisionBehaviorEvent[] = [];
    const primary = frame.primaryFace;

    this.applyGateTransition(
      "FACE_MISSING",
      this.gates.FACE_MISSING.update(
        !frame.faceDetected,
        frame.faceDetected,
        timestampMs,
      ),
      frame,
      events,
    );
    this.applyGateTransition(
      "MULTIPLE_FACES",
      this.gates.MULTIPLE_FACES.update(
        frame.faceCount >= 2,
        frame.faceCount <= 1,
        timestampMs,
      ),
      frame,
      events,
    );

    const faceArea = primary?.box.areaRatio ?? null;
    this.applyGateTransition(
      "FACE_TOO_SMALL",
      this.gates.FACE_TOO_SMALL.update(
        faceArea !== null && faceArea < this.config.faceArea.entry,
        faceArea !== null && faceArea > this.config.faceArea.recovery,
        timestampMs,
      ),
      frame,
      events,
    );

    const inFrameRatio = primary?.box.inFrameRatio ?? null;
    this.applyGateTransition(
      "FACE_OUT_OF_FRAME",
      this.gates.FACE_OUT_OF_FRAME.update(
        inFrameRatio !== null &&
          inFrameRatio < this.config.faceInFrame.entry,
        inFrameRatio !== null &&
          inFrameRatio > this.config.faceInFrame.recovery,
        timestampMs,
      ),
      frame,
      events,
    );

    this.applyGateTransition(
      "LOW_LIGHT",
      this.gates.LOW_LIGHT.update(
        frame.imageQuality.brightnessScore < this.config.brightness.entry,
        frame.imageQuality.brightnessScore > this.config.brightness.recovery,
        timestampMs,
      ),
      frame,
      events,
    );
    this.applyGateTransition(
      "SEVERE_BLUR",
      this.gates.SEVERE_BLUR.update(
        frame.imageQuality.blurScore < this.config.blur.entry,
        frame.imageQuality.blurScore > this.config.blur.recovery,
        timestampMs,
      ),
      frame,
      events,
    );

    const poseEntry = this.isExtremePoseEntry(frame);
    const poseRecovered = this.isExtremePoseRecovered(frame);
    this.applyGateTransition(
      "EXTREME_HEAD_POSE",
      this.gates.EXTREME_HEAD_POSE.update(
        poseEntry,
        poseRecovered,
        timestampMs,
      ),
      frame,
      events,
    );

    const immediateReasons = this.getImmediateReasons(runtime);
    const activeReasonSet = new Set<FaceQualityReason>(immediateReasons);
    for (const reason of QUALITY_GATE_REASONS) {
      if (this.gates[reason].isActive()) {
        activeReasonSet.add(reason);
      }
    }
    const reasons = FACE_QUALITY_REASONS.filter((reason) =>
      activeReasonSet.has(reason),
    );

    if (reasons.length > 0) {
      this.enterUnavailable(timestampMs, reasons, events);
    } else {
      this.advanceRecovery(timestampMs, events);
    }

    this.activeReasons = reasons;
    if (
      this.state === "USABLE" &&
      QUALITY_GATE_REASONS.some(
        (reason) => this.gates[reason].getSnapshot().state === "ENTRY_CANDIDATE",
      )
    ) {
      this.state = "UNUSABLE_CANDIDATE";
    } else if (this.state === "UNUSABLE_CANDIDATE" && reasons.length === 0) {
      this.state = "USABLE";
    }

    const usable = this.state === "USABLE" || this.state === "UNUSABLE_CANDIDATE";
    const decision: FaceQualityDecision = {
      usable,
      confidence: this.config.defaultEventConfidence,
      reasons,
    };

    return { decision, events, state: this.getState() };
  }

  getState(): Readonly<FaceQualityDetectorState> {
    return {
      state: this.state,
      activeReasons: this.activeReasons,
      unavailableSinceMs: this.unavailableSinceMs,
      recoverySinceMs: this.recoverySinceMs,
      gates: {
        FACE_MISSING: this.gates.FACE_MISSING.getSnapshot(),
        MULTIPLE_FACES: this.gates.MULTIPLE_FACES.getSnapshot(),
        FACE_TOO_SMALL: this.gates.FACE_TOO_SMALL.getSnapshot(),
        FACE_OUT_OF_FRAME: this.gates.FACE_OUT_OF_FRAME.getSnapshot(),
        LOW_LIGHT: this.gates.LOW_LIGHT.getSnapshot(),
        SEVERE_BLUR: this.gates.SEVERE_BLUR.getSnapshot(),
        EXTREME_HEAD_POSE: this.gates.EXTREME_HEAD_POSE.getSnapshot(),
      },
    };
  }

  reset(): void {
    for (const gate of Object.values(this.gates)) {
      gate.reset();
    }
    this.episodeIds.clear();
    this.state = "USABLE";
    this.activeReasons = [];
    this.unavailableSinceMs = null;
    this.recoverySinceMs = null;
    this.analysisEpisodeId = null;
  }

  private applyGateTransition(
    reason: QualityGateReason,
    transition: HysteresisGateTransition | null,
    frame: NormalizedFaceFrame,
    events: VisionBehaviorEvent[],
  ): void {
    if (transition === null) {
      return;
    }

    if (transition.type === "ACTIVATED") {
      const episodeId = this.eventFactory.createEpisodeId();
      this.episodeIds.set(reason, episodeId);
      switch (reason) {
        case "FACE_MISSING":
          events.push(
            this.eventFactory.createBehaviorEvent("FACE_MISSING_STARTED", {
              confidence: this.config.defaultEventConfidence,
              episodeId,
              payload: {
                observedStartElapsedMs: transition.observedStartMs,
              },
            }),
          );
          break;
        case "MULTIPLE_FACES":
          events.push(
            this.eventFactory.createBehaviorEvent("MULTIPLE_FACES_DETECTED", {
              confidence: this.config.defaultEventConfidence,
              episodeId,
              payload: {
                observedStartElapsedMs: transition.observedStartMs,
                faceCount: frame.faceCount,
              },
            }),
          );
          break;
        case "LOW_LIGHT":
          events.push(
            this.eventFactory.createBehaviorEvent("LOW_LIGHT_STARTED", {
              confidence: this.config.defaultEventConfidence,
              episodeId,
              payload: {
                observedStartElapsedMs: transition.observedStartMs,
                brightnessScore: frame.imageQuality.brightnessScore,
                entryThreshold: this.config.brightness.entry,
              },
            }),
          );
          break;
        case "FACE_TOO_SMALL":
          events.push(
            this.eventFactory.createBehaviorEvent("FACE_TOO_SMALL_STARTED", {
              confidence: this.config.defaultEventConfidence,
              episodeId,
              payload: {
                observedStartElapsedMs: transition.observedStartMs,
                faceAreaRatio: frame.primaryFace?.box.areaRatio ?? 0,
                entryThreshold: this.config.faceArea.entry,
              },
            }),
          );
          break;
        case "FACE_OUT_OF_FRAME":
        case "SEVERE_BLUR":
        case "EXTREME_HEAD_POSE":
          break;
      }
      return;
    }

    const episodeId = this.episodeIds.get(reason) ?? null;
    switch (reason) {
      case "FACE_MISSING":
        events.push(
          this.eventFactory.createBehaviorEvent("FACE_MISSING_ENDED", {
            confidence: this.config.defaultEventConfidence,
            episodeId,
            payload: {
              observedEndElapsedMs: transition.observedEndMs,
              durationMs: transition.activeDurationMs,
            },
          }),
        );
        break;
      case "LOW_LIGHT":
        events.push(
          this.eventFactory.createBehaviorEvent("LOW_LIGHT_ENDED", {
            confidence: this.config.defaultEventConfidence,
            episodeId,
            payload: {
              observedEndElapsedMs: transition.observedEndMs,
              durationMs: transition.activeDurationMs,
              brightnessScore: frame.imageQuality.brightnessScore,
            },
          }),
        );
        break;
      case "FACE_TOO_SMALL":
        events.push(
          this.eventFactory.createBehaviorEvent("FACE_TOO_SMALL_ENDED", {
            confidence: this.config.defaultEventConfidence,
            episodeId,
            payload: {
              observedEndElapsedMs: transition.observedEndMs,
              durationMs: transition.activeDurationMs,
              faceAreaRatio: frame.primaryFace?.box.areaRatio ?? 0,
            },
          }),
        );
        break;
      case "MULTIPLE_FACES":
      case "FACE_OUT_OF_FRAME":
      case "SEVERE_BLUR":
      case "EXTREME_HEAD_POSE":
        break;
    }
    this.episodeIds.delete(reason);
  }

  private enterUnavailable(
    timestampMs: number,
    reasons: readonly FaceQualityReason[],
    events: VisionBehaviorEvent[],
  ): void {
    if (this.state === "UNUSABLE") {
      return;
    }
    if (this.state === "RECOVERY_CANDIDATE") {
      // Recovery was not yet published, so this is the same unavailable episode.
      this.state = "UNUSABLE";
      this.recoverySinceMs = null;
      return;
    }

    const observedStartMs = Math.min(
      timestampMs,
      ...QUALITY_GATE_REASONS.map(
        (reason) =>
          this.gates[reason].getSnapshot().activeSinceMs ?? timestampMs,
      ),
    );
    this.state = "UNUSABLE";
    this.unavailableSinceMs = observedStartMs;
    this.recoverySinceMs = null;
    this.analysisEpisodeId = this.eventFactory.createEpisodeId();
    events.push(
      this.eventFactory.createBehaviorEvent("ANALYSIS_UNAVAILABLE", {
        confidence: this.config.defaultEventConfidence,
        episodeId: this.analysisEpisodeId,
        payload: { observedStartElapsedMs: observedStartMs, reasons },
      }),
    );
  }

  private advanceRecovery(
    timestampMs: number,
    events: VisionBehaviorEvent[],
  ): void {
    if (this.state === "UNUSABLE") {
      this.state = "RECOVERY_CANDIDATE";
      this.recoverySinceMs = timestampMs;
      return;
    }
    if (this.state !== "RECOVERY_CANDIDATE") {
      return;
    }

    const recoverySinceMs = this.recoverySinceMs ?? timestampMs;
    if (
      timestampMs - recoverySinceMs <
      this.config.analysisRecoveryWarmupMs
    ) {
      return;
    }

    const unavailableSinceMs = this.unavailableSinceMs ?? recoverySinceMs;
    events.push(
      this.eventFactory.createBehaviorEvent("ANALYSIS_RECOVERED", {
        confidence: this.config.defaultEventConfidence,
        episodeId: this.analysisEpisodeId,
        payload: {
          observedEndElapsedMs: recoverySinceMs,
          durationMs: Math.max(0, recoverySinceMs - unavailableSinceMs),
        },
      }),
    );
    this.state = "USABLE";
    this.unavailableSinceMs = null;
    this.recoverySinceMs = null;
    this.analysisEpisodeId = null;
  }

  private getImmediateReasons(
    runtime: FaceQualityRuntimeStatus,
  ): readonly FaceQualityReason[] {
    const reasons: FaceQualityReason[] = [];
    if (runtime.trackEnded) reasons.push("TRACK_ENDED");
    else if (!runtime.cameraEnabled) reasons.push("CAMERA_DISABLED");
    if (!runtime.videoDimensionsAvailable)
      reasons.push("VIDEO_DIMENSIONS_UNAVAILABLE");
    if (!runtime.tabVisible) reasons.push("TAB_HIDDEN");
    if (!runtime.landmarkerAvailable) reasons.push("LANDMARKER_UNAVAILABLE");
    if (!runtime.workerHealthy) reasons.push("WORKER_ERROR");
    return reasons;
  }

  private isExtremePoseEntry(frame: NormalizedFaceFrame): boolean {
    const face = frame.primaryFace;
    if (face === null) return false;
    return (
      (face.yaw !== null &&
        Math.abs(face.yaw) > this.config.extremeYaw.entryDegrees) ||
      (face.pitch !== null &&
        Math.abs(face.pitch) > this.config.extremePitch.entryDegrees) ||
      (face.roll !== null &&
        Math.abs(face.roll) > this.config.extremeRoll.entryDegrees)
    );
  }

  private isExtremePoseRecovered(frame: NormalizedFaceFrame): boolean {
    const face = frame.primaryFace;
    if (face === null) return false;
    return (
      (face.yaw === null ||
        Math.abs(face.yaw) < this.config.extremeYaw.recoveryDegrees) &&
      (face.pitch === null ||
        Math.abs(face.pitch) < this.config.extremePitch.recoveryDegrees) &&
      (face.roll === null ||
        Math.abs(face.roll) < this.config.extremeRoll.recoveryDegrees)
    );
  }
}
