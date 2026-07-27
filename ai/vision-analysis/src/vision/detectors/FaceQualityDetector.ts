import type { MediaStreamHealth } from "../../media/MediaStreamHealth.js";
import type { VisionConfig } from "../config/VisionConfig.js";
import {
  FACE_QUALITY_REASONS,
  type FaceQualityComponents,
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
  "FACE_TOO_LARGE",
  "FACE_OUT_OF_FRAME",
  "LOW_LIGHT",
  "BACKLIGHT",
  "SEVERE_BLUR",
  "EXTREME_HEAD_POSE",
] as const;

type QualityGateReason = (typeof QUALITY_GATE_REASONS)[number];

export const FACE_QUALITY_STATES = [
  "USABLE",
  "DEGRADED_CANDIDATE",
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
  readonly pendingReasons: readonly FaceQualityReason[];
  readonly unavailableSinceMs: number | null;
  readonly recoverySinceMs: number | null;
  readonly confidence: number;
  readonly components: FaceQualityComponents;
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
  private pendingReasons: readonly FaceQualityReason[] = [];
  private unavailableSinceMs: number | null = null;
  private recoverySinceMs: number | null = null;
  private analysisEpisodeId: string | null = null;
  private previousTrackingSample: {
    readonly timestampMs: number;
    readonly centerX: number;
    readonly centerY: number;
    readonly areaRatio: number;
  } | null = null;
  private qualityConfidence = 0;
  private qualityComponents: FaceQualityComponents = {
    facePresence: 0,
    faceSize: 0,
    inFrame: 0,
    brightness: 0,
    blur: 0,
    poseObservability: 0,
    trackingStability: 0,
  };

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
      FACE_TOO_LARGE: new HysteresisGate(
        config.faceAreaMaximum.entryDurationMs,
        config.faceAreaMaximum.recoveryDurationMs,
      ),
      FACE_OUT_OF_FRAME: new HysteresisGate(
        config.faceInFrame.entryDurationMs,
        config.faceInFrame.recoveryDurationMs,
      ),
      LOW_LIGHT: new HysteresisGate(
        config.brightness.entryDurationMs,
        config.brightness.recoveryDurationMs,
      ),
      BACKLIGHT: new HysteresisGate(
        config.backlight.entryDurationMs,
        config.backlight.recoveryDurationMs,
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
    const immediateReasons = this.getImmediateReasons(runtime);
    this.qualityComponents = this.computeQualityComponents(frame, runtime);
    this.qualityConfidence = this.computeQualityConfidence(
      this.qualityComponents,
      immediateReasons,
      false,
    );

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
    this.applyGateTransition(
      "FACE_TOO_LARGE",
      this.gates.FACE_TOO_LARGE.update(
        faceArea !== null && faceArea > this.config.faceAreaMaximum.entry,
        faceArea !== null && faceArea < this.config.faceAreaMaximum.recovery,
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
    const backlightScore = frame.imageQuality.backlightScore ?? 1;
    this.applyGateTransition(
      "BACKLIGHT",
      this.gates.BACKLIGHT.update(
        backlightScore < this.config.backlight.entry,
        backlightScore > this.config.backlight.recovery,
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

    const activeReasonSet = new Set<FaceQualityReason>(immediateReasons);
    for (const reason of QUALITY_GATE_REASONS) {
      if (this.gates[reason].isActive()) {
        activeReasonSet.add(reason);
      }
    }
    const reasons = FACE_QUALITY_REASONS.filter((reason) =>
      activeReasonSet.has(reason),
    );
    const pendingDegradation = QUALITY_GATE_REASONS.some(
      (reason) => this.gates[reason].getSnapshot().state === "ENTRY_CANDIDATE",
    );
    this.pendingReasons = QUALITY_GATE_REASONS.filter(
      (reason) => this.gates[reason].getSnapshot().state === "ENTRY_CANDIDATE",
    );

    if (reasons.length > 0) {
      this.enterUnavailable(timestampMs, reasons, events);
    } else {
      this.advanceRecovery(timestampMs, events);
    }

    this.activeReasons = reasons;
    if (this.state === "USABLE" && pendingDegradation) {
      this.state = "DEGRADED_CANDIDATE";
    } else if (this.state === "DEGRADED_CANDIDATE" && !pendingDegradation) {
      this.state = "USABLE";
    }

    this.qualityComponents = this.computeQualityComponents(frame, runtime);
    this.qualityConfidence = this.computeQualityConfidence(
      this.qualityComponents,
      immediateReasons,
      pendingDegradation,
    );
    const usable =
      this.state === "USABLE" || this.state === "DEGRADED_CANDIDATE";
    const decision: FaceQualityDecision = {
      usable,
      calibrationEligible: this.state === "USABLE",
      canStartBehavior: this.state === "USABLE",
      confidence: this.qualityConfidence,
      components: this.qualityComponents,
      reasons,
      state: this.state,
      pendingReasons: this.pendingReasons,
      unavailableSinceMs: this.unavailableSinceMs,
    };

    return { decision, events, state: this.getState() };
  }

  getState(): Readonly<FaceQualityDetectorState> {
    return {
      state: this.state,
      activeReasons: this.activeReasons,
      pendingReasons: this.pendingReasons,
      unavailableSinceMs: this.unavailableSinceMs,
      recoverySinceMs: this.recoverySinceMs,
      confidence: this.qualityConfidence,
      components: this.qualityComponents,
      gates: {
        FACE_MISSING: this.gates.FACE_MISSING.getSnapshot(),
        MULTIPLE_FACES: this.gates.MULTIPLE_FACES.getSnapshot(),
        FACE_TOO_SMALL: this.gates.FACE_TOO_SMALL.getSnapshot(),
        FACE_TOO_LARGE: this.gates.FACE_TOO_LARGE.getSnapshot(),
        FACE_OUT_OF_FRAME: this.gates.FACE_OUT_OF_FRAME.getSnapshot(),
        LOW_LIGHT: this.gates.LOW_LIGHT.getSnapshot(),
        BACKLIGHT: this.gates.BACKLIGHT.getSnapshot(),
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
    this.pendingReasons = [];
    this.unavailableSinceMs = null;
    this.recoverySinceMs = null;
    this.analysisEpisodeId = null;
    this.previousTrackingSample = null;
    this.qualityConfidence = 0;
    this.qualityComponents = {
      facePresence: 0,
      faceSize: 0,
      inFrame: 0,
      brightness: 0,
      blur: 0,
      poseObservability: 0,
      trackingStability: 0,
    };
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
              confidence: this.qualityConfidence,
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
              confidence: this.qualityConfidence,
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
              confidence: this.qualityConfidence,
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
              confidence: this.qualityConfidence,
              episodeId,
              payload: {
                observedStartElapsedMs: transition.observedStartMs,
                faceAreaRatio: frame.primaryFace?.box.areaRatio ?? 0,
                entryThreshold: this.config.faceArea.entry,
              },
            }),
          );
          break;
        case "FACE_TOO_LARGE":
        case "BACKLIGHT":
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
            confidence: this.qualityConfidence,
            episodeId,
            payload: {
              observedEndElapsedMs: transition.observedEndMs,
              wallDurationMs: transition.activeDurationMs,
              observedDurationMs: transition.activeDurationMs,
              unobservedDurationMs: 0,
            },
          }),
        );
        break;
      case "LOW_LIGHT":
        events.push(
          this.eventFactory.createBehaviorEvent("LOW_LIGHT_ENDED", {
            confidence: this.qualityConfidence,
            episodeId,
            payload: {
              observedEndElapsedMs: transition.observedEndMs,
              wallDurationMs: transition.activeDurationMs,
              observedDurationMs: transition.activeDurationMs,
              unobservedDurationMs: 0,
              brightnessScore: frame.imageQuality.brightnessScore,
            },
          }),
        );
        break;
      case "FACE_TOO_SMALL":
        events.push(
          this.eventFactory.createBehaviorEvent("FACE_TOO_SMALL_ENDED", {
            confidence: this.qualityConfidence,
            episodeId,
            payload: {
              observedEndElapsedMs: transition.observedEndMs,
              wallDurationMs: transition.activeDurationMs,
              observedDurationMs: transition.activeDurationMs,
              unobservedDurationMs: 0,
              faceAreaRatio: frame.primaryFace?.box.areaRatio ?? 0,
            },
          }),
        );
        break;
      case "FACE_TOO_LARGE":
      case "BACKLIGHT":
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
        confidence: this.qualityConfidence,
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
        confidence: this.qualityConfidence,
        episodeId: this.analysisEpisodeId,
        payload: {
          observedEndElapsedMs: recoverySinceMs,
          wallDurationMs: Math.max(
            0,
            recoverySinceMs - unavailableSinceMs,
          ),
          observedDurationMs: Math.max(
            0,
            recoverySinceMs - unavailableSinceMs,
          ),
          unobservedDurationMs: 0,
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

  private computeQualityComponents(
    frame: NormalizedFaceFrame,
    runtime: FaceQualityRuntimeStatus,
  ): FaceQualityComponents {
    const face = frame.primaryFace;
    const runtimeAvailable =
      runtime.cameraEnabled &&
      !runtime.trackEnded &&
      runtime.videoDimensionsAvailable &&
      runtime.tabVisible &&
      runtime.landmarkerAvailable &&
      runtime.workerHealthy;
    const facePresence =
      runtimeAvailable && frame.faceDetected && frame.faceCount === 1 ? 1 : 0;
    const area = face?.box.areaRatio ?? 0;
    const faceSize =
      face === null
        ? 0
        : this.trapezoidQuality(
            area,
            this.config.faceArea.entry,
            this.config.faceArea.recovery,
            this.config.faceAreaMaximum.recovery,
            this.config.faceAreaMaximum.entry,
          );
    const inFrame = face?.box.inFrameRatio ?? 0;
    const poseValues = [face?.yaw, face?.pitch, face?.roll];
    const poseObservability =
      poseValues.filter((value) => value !== null && value !== undefined)
        .length / poseValues.length;
    const trackingStability = this.computeTrackingStability(frame);
    return {
      facePresence,
      faceSize,
      inFrame,
      brightness: frame.imageQuality.brightnessScore,
      blur: frame.imageQuality.blurScore,
      poseObservability,
      trackingStability,
    };
  }

  private computeQualityConfidence(
    components: FaceQualityComponents,
    immediateReasons: readonly FaceQualityReason[],
    pendingDegradation: boolean,
  ): number {
    const weighted =
      components.facePresence * 0.24 +
      components.faceSize * 0.14 +
      components.inFrame * 0.14 +
      components.brightness * 0.14 +
      components.blur * 0.12 +
      components.poseObservability * 0.1 +
      components.trackingStability * 0.12;
    let mandatoryCap = 1;
    if (immediateReasons.length > 0 || components.facePresence === 0) {
      mandatoryCap = 0;
    } else if (components.inFrame < this.config.faceInFrame.entry) {
      mandatoryCap = 0.4;
    } else if (components.faceSize < 0.25) {
      mandatoryCap = 0.5;
    } else if (pendingDegradation) {
      mandatoryCap = 0.7;
    }
    return Math.max(0, Math.min(1, Math.min(mandatoryCap, weighted)));
  }

  private computeTrackingStability(frame: NormalizedFaceFrame): number {
    const face = frame.primaryFace;
    if (face === null) {
      this.previousTrackingSample = null;
      return 0;
    }
    const current = {
      timestampMs: frame.sessionElapsedMs,
      centerX: face.box.centerX,
      centerY: face.box.centerY,
      areaRatio: face.box.areaRatio,
    };
    const previous = this.previousTrackingSample;
    this.previousTrackingSample = current;
    if (previous === null) return 0.75;
    const elapsedMs = current.timestampMs - previous.timestampMs;
    if (elapsedMs <= 0 || elapsedMs > 1_500) return 0.5;
    const centerShift = Math.hypot(
      current.centerX - previous.centerX,
      current.centerY - previous.centerY,
    );
    const areaShift =
      Math.abs(current.areaRatio - previous.areaRatio) /
      Math.max(previous.areaRatio, 0.000001);
    return Math.max(0, Math.min(1, 1 - centerShift * 4 - areaShift));
  }

  private trapezoidQuality(
    value: number,
    lowBad: number,
    lowGood: number,
    highGood: number,
    highBad: number,
  ): number {
    if (value <= lowBad || value >= highBad) return 0;
    if (value >= lowGood && value <= highGood) return 1;
    if (value < lowGood) {
      return (value - lowBad) / Math.max(lowGood - lowBad, 0.000001);
    }
    return (highBad - value) / Math.max(highBad - highGood, 0.000001);
  }
}
