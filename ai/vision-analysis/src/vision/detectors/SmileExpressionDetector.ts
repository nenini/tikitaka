import type { VisionConfig } from "../config/VisionConfig.js";
import type { NormalizedFaceFrame } from "../core/NormalizedFaceFrame.js";
import type { EpisodeTerminationReason, VisionBehaviorEvent } from "../events/VisionEvent.js";
import type { VisionEventFactory } from "../events/VisionEventFactory.js";
import { EmaFilter } from "../filters/EmaFilter.js";
import type { DetectorSuspensionContext, VisionDetector, VisionDetectorContext } from "./VisionDetector.js";

export const SMILE_STATES = ["WAITING_FOR_BASELINE", "IDLE", "SMILE_CANDIDATE", "SMILE_ACTIVE", "END_CANDIDATE"] as const;
export type SmileStateName = (typeof SMILE_STATES)[number];
export interface SmileExpressionDetectorState {
  readonly state: SmileStateName;
  readonly mouthSmileLeft: number | null;
  readonly mouthSmileRight: number | null;
  readonly cheekSquintLeft: number | null;
  readonly cheekSquintRight: number | null;
  readonly rawScore: number | null;
  readonly smoothedScore: number | null;
  readonly baselineScore: number | null;
  readonly baselineDelta: number | null;
  readonly stateSinceMs: number | null;
  readonly activeSinceMs: number | null;
  readonly peakScore: number;
}

function terminationReason(reason: DetectorSuspensionContext["reason"]): EpisodeTerminationReason {
  if (reason === "CONSENT_WITHDRAWN") return "CONSENT_WITHDRAWN";
  if (reason === "SESSION_ENDED") return "SESSION_ENDED";
  return "ANALYSIS_UNAVAILABLE";
}

/** Detects an observable mouth-corner/cheek movement, never an emotional state. */
export class SmileExpressionDetector implements VisionDetector<NormalizedFaceFrame, SmileExpressionDetectorState> {
  readonly name = "SmileExpressionDetector";
  private state: SmileStateName = "WAITING_FOR_BASELINE";
  private stateSinceMs: number | null = null;
  private activeSinceMs: number | null = null;
  private episodeId: string | null = null;
  private peakScore = 0;
  private scoreSum = 0;
  private scoreCount = 0;
  private readonly scoreFilter: EmaFilter;
  private snapshot: SmileExpressionDetectorState = this.emptyState();

  constructor(private readonly config: VisionConfig["smile"], private readonly eventFactory: VisionEventFactory) {
    this.scoreFilter = new EmaFilter(config.emaAlpha);
  }

  update(frame: NormalizedFaceFrame, context: VisionDetectorContext): readonly VisionBehaviorEvent[] {
    if (!context.quality.usable || frame.primaryFace === null) return this.suspend({ sessionElapsedMs: frame.sessionElapsedMs, clientMonotonicMs: frame.clientMonotonicMs, reason: "ANALYSIS_UNAVAILABLE" });
    if (context.baseline.status !== "READY" && context.baseline.status !== "FALLBACK") {
      this.state = "WAITING_FOR_BASELINE"; this.snapshot = this.emptyState(); return [];
    }
    const shapes = frame.primaryFace.blendshapes;
    const left = shapes["mouthSmileLeft"] ?? 0;
    const right = shapes["mouthSmileRight"] ?? 0;
    const cheekLeft = shapes["cheekSquintLeft"] ?? 0;
    const cheekRight = shapes["cheekSquintRight"] ?? 0;
    const raw = this.config.smileWeight * ((left + right) / 2) + this.config.cheekWeight * ((cheekLeft + cheekRight) / 2);
    const score = this.scoreFilter.update(raw);
    const baseShapes = context.baseline.blendshapeMeans;
    const base = this.config.smileWeight * (((baseShapes["mouthSmileLeft"] ?? 0) + (baseShapes["mouthSmileRight"] ?? 0)) / 2) +
      this.config.cheekWeight * (((baseShapes["cheekSquintLeft"] ?? 0) + (baseShapes["cheekSquintRight"] ?? 0)) / 2);
    const delta = score - base;
    const entry = score >= this.config.entryAbsoluteScore && delta >= this.config.entryBaselineDelta;
    const recovered = delta <= this.config.recoveryBaselineDelta;
    const now = frame.sessionElapsedMs;
    const events: VisionBehaviorEvent[] = [];
    if (this.state === "WAITING_FOR_BASELINE") this.transition("IDLE", now);
    if (this.state === "IDLE" && entry) this.transition("SMILE_CANDIDATE", now);
    else if (this.state === "SMILE_CANDIDATE") {
      if (!entry) this.transition("IDLE", now);
      else if (now - (this.stateSinceMs ?? now) >= this.config.minimumDurationMs) {
        this.activeSinceMs = this.stateSinceMs; this.episodeId = this.eventFactory.createEpisodeId();
        this.peakScore = score; this.scoreSum = score; this.scoreCount = 1; this.transition("SMILE_ACTIVE", now);
        events.push(this.eventFactory.createBehaviorEvent("SMILE_STARTED", { confidence: this.config.defaultEventConfidence, episodeId: this.episodeId, payload: { observedStartElapsedMs: this.activeSinceMs ?? now, smileScore: score, baselineDelta: delta } }));
      }
    } else if (this.state === "SMILE_ACTIVE") {
      this.recordScore(score);
      if (recovered) this.transition("END_CANDIDATE", now);
    } else if (this.state === "END_CANDIDATE") {
      this.recordScore(score);
      if (!recovered) this.transition("SMILE_ACTIVE", now);
      else if (now - (this.stateSinceMs ?? now) >= Math.max(this.config.recoveryDurationMs, this.config.mergeGapMs)) {
        events.push(this.endEpisode(now, "RECOVERED")); this.transition("IDLE", now);
      }
    }
    this.snapshot = { state: this.state, mouthSmileLeft: left, mouthSmileRight: right, cheekSquintLeft: cheekLeft, cheekSquintRight: cheekRight, rawScore: raw, smoothedScore: score, baselineScore: base, baselineDelta: delta, stateSinceMs: this.stateSinceMs, activeSinceMs: this.activeSinceMs, peakScore: this.peakScore };
    return events;
  }

  suspend(context: DetectorSuspensionContext): readonly VisionBehaviorEvent[] {
    const events = this.activeSinceMs === null ? [] : [this.endEpisode(context.sessionElapsedMs, terminationReason(context.reason))];
    this.scoreFilter.reset(); this.state = "WAITING_FOR_BASELINE"; this.stateSinceMs = null; this.snapshot = this.emptyState(); return events;
  }

  getState(): Readonly<SmileExpressionDetectorState> { return this.snapshot; }
  reset(): void { this.scoreFilter.reset(); this.state = "WAITING_FOR_BASELINE"; this.stateSinceMs = null; this.activeSinceMs = null; this.episodeId = null; this.peakScore = 0; this.scoreSum = 0; this.scoreCount = 0; this.snapshot = this.emptyState(); }
  private transition(state: SmileStateName, now: number): void { this.state = state; this.stateSinceMs = now; }
  private recordScore(score: number): void { this.peakScore = Math.max(this.peakScore, score); this.scoreSum += score; this.scoreCount += 1; }
  private endEpisode(now: number, reason: EpisodeTerminationReason): VisionBehaviorEvent {
    const start = this.activeSinceMs ?? now;
    const event = this.eventFactory.createBehaviorEvent("SMILE_ENDED", { confidence: this.config.defaultEventConfidence, episodeId: this.episodeId, payload: { observedEndElapsedMs: now, durationMs: Math.max(0, now - start), peakSmileScore: this.peakScore, meanSmileScore: this.scoreCount === 0 ? this.peakScore : this.scoreSum / this.scoreCount, terminationReason: reason } });
    this.activeSinceMs = null; this.episodeId = null; this.peakScore = 0; this.scoreSum = 0; this.scoreCount = 0; return event;
  }
  private emptyState(): SmileExpressionDetectorState { return { state: this.state, mouthSmileLeft: null, mouthSmileRight: null, cheekSquintLeft: null, cheekSquintRight: null, rawScore: null, smoothedScore: null, baselineScore: null, baselineDelta: null, stateSinceMs: this.stateSinceMs, activeSinceMs: this.activeSinceMs, peakScore: this.peakScore }; }
}
