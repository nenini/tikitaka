import type { Clock } from "../../common/Clock.js";
import { toIsoTimestamp } from "../../common/Clock.js";
import type { SequenceGenerator } from "../../common/SequenceGenerator.js";
import type { SessionTimeline } from "../../common/SessionTimeline.js";
import type { UuidFactory } from "../../common/ClientInstanceId.js";
import type {
  VisionBehaviorEventFor,
  VisionBehaviorEventType,
  VisionBehaviorPayloadMap,
  VisionEventEnvelope,
  VisionEventSource,
  VisionMetricSnapshot,
  VisionMetricSnapshotPayload,
} from "./VisionEvent.js";

const EVENT_SOURCE_BY_TYPE = {
  FACE_MISSING_STARTED: "FACE_QUALITY_DETECTOR",
  FACE_MISSING_ENDED: "FACE_QUALITY_DETECTOR",
  MULTIPLE_FACES_DETECTED: "FACE_QUALITY_DETECTOR",
  LOW_LIGHT_STARTED: "FACE_QUALITY_DETECTOR",
  LOW_LIGHT_ENDED: "FACE_QUALITY_DETECTOR",
  FACE_TOO_SMALL_STARTED: "FACE_QUALITY_DETECTOR",
  FACE_TOO_SMALL_ENDED: "FACE_QUALITY_DETECTOR",
  ANALYSIS_UNAVAILABLE: "FACE_QUALITY_DETECTOR",
  ANALYSIS_RECOVERED: "FACE_QUALITY_DETECTOR",
  GAZE_AWAY_STARTED: "SCREEN_ATTENTION_DETECTOR",
  GAZE_AWAY_ENDED: "SCREEN_ATTENTION_DETECTOR",
  PROLONGED_GAZE_AWAY: "SCREEN_ATTENTION_DETECTOR",
  SMILE_STARTED: "SMILE_EXPRESSION_DETECTOR",
  SMILE_ENDED: "SMILE_EXPRESSION_DETECTOR",
  NOD_EVENT: "NOD_DETECTOR",
  LOW_EXPRESSION_ACTIVITY_STARTED: "EXPRESSION_ACTIVITY_DETECTOR",
  LOW_EXPRESSION_ACTIVITY_ENDED: "EXPRESSION_ACTIVITY_DETECTOR",
} as const satisfies Readonly<
  Record<VisionBehaviorEventType, VisionEventSource>
>;

export interface VisionEventIdentity {
  readonly sessionId: string;
  readonly userId: string;
  readonly clientInstanceId: string;
}

export interface VisionEventVersions {
  readonly modelVersion: string;
  readonly ruleVersion: string;
}

export interface CreateBehaviorEventOptions<
  TEventType extends VisionBehaviorEventType,
> {
  readonly confidence: number;
  readonly episodeId: string | null;
  readonly payload: VisionBehaviorPayloadMap[TEventType];
}

export interface CreateMetricSnapshotOptions {
  readonly confidence: number;
  readonly payload: VisionMetricSnapshotPayload;
}

export class VisionEventFactory {
  constructor(
    private readonly identity: VisionEventIdentity,
    private readonly versions: VisionEventVersions,
    private readonly timeline: SessionTimeline,
    private readonly clock: Clock,
    private readonly sequence: SequenceGenerator,
    private readonly uuidFactory: UuidFactory,
  ) {}

  createEpisodeId(): string {
    return this.uuidFactory();
  }

  createBehaviorEvent<TEventType extends VisionBehaviorEventType>(
    eventType: TEventType,
    options: CreateBehaviorEventOptions<TEventType>,
  ): VisionBehaviorEventFor<TEventType> {
    return {
      ...this.createEnvelope(eventType, options.confidence),
      kind: "behavior",
      source: EVENT_SOURCE_BY_TYPE[eventType],
      episodeId: options.episodeId,
      payload: options.payload,
    };
  }

  createMetricSnapshot(
    options: CreateMetricSnapshotOptions,
  ): VisionMetricSnapshot {
    return {
      ...this.createEnvelope("VISION_METRIC_SNAPSHOT", options.confidence),
      kind: "metric",
      source: "VISION_PIPELINE",
      payload: options.payload,
    };
  }

  private createEnvelope<TEventType extends string>(
    eventType: TEventType,
    confidence: number,
  ): Omit<VisionEventEnvelope<TEventType>, "source"> {
    const timePoint = this.timeline.now();

    return {
      eventId: this.uuidFactory(),
      eventType,
      version: 1,
      sessionId: this.identity.sessionId,
      userId: this.identity.userId,
      clientInstanceId: this.identity.clientInstanceId,
      seq: this.sequence.next(),
      sessionElapsedMs: timePoint.sessionElapsedMs,
      clientMonotonicMs: timePoint.clientMonotonicMs,
      occurredAt: toIsoTimestamp(this.clock.wallClockNowMs()),
      confidence,
      modelVersion: this.versions.modelVersion,
      ruleVersion: this.versions.ruleVersion,
    };
  }
}

