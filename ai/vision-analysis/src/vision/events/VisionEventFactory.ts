import type { Clock } from "../../common/Clock.js";
import { toIsoTimestamp } from "../../common/Clock.js";
import type { SequenceGenerator } from "../../common/SequenceGenerator.js";
import type { SessionTimeline } from "../../common/SessionTimeline.js";
import type { SessionTimePoint } from "../../common/SessionTimeline.js";
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
  STIFF_EXPRESSION_STARTED: "EXPRESSION_ACTIVITY_DETECTOR",
  STIFF_EXPRESSION_ENDED: "EXPRESSION_ACTIVITY_DETECTOR",
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
  readonly confidenceDetails?: EventConfidenceDetails;
  readonly episodeId: string | null;
  readonly payload: VisionBehaviorPayloadMap[TEventType];
}

export interface CreateMetricSnapshotOptions {
  readonly confidence: number;
  readonly confidenceDetails?: EventConfidenceDetails;
  readonly payload: VisionMetricSnapshotPayload;
}

export interface EventConfidenceDetails {
  readonly measurementConfidence?: number;
  readonly signalClarity?: number;
  readonly personalizationConfidence?: number;
  readonly evidenceStrength?: number;
  readonly baselineMode?: VisionEventEnvelope<string>["baselineMode"];
  readonly coachingEligible?: boolean;
  readonly baselineEpoch?: number;
}

export class VisionEventFactory {
  // The override exists only during one synchronous pipeline call and is restored
  // in finally, so detector order cannot leak timing state into the next frame.
  private scopedTimePoint: SessionTimePoint | null = null;

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

  /** Keeps every event produced for one frame on the frame's captured timeline. */
  withTimePoint<T>(timePoint: SessionTimePoint, operation: () => T): T {
    if (
      !Number.isFinite(timePoint.sessionElapsedMs) ||
      timePoint.sessionElapsedMs < 0 ||
      !Number.isFinite(timePoint.clientMonotonicMs) ||
      timePoint.clientMonotonicMs < 0
    ) {
      throw new RangeError("event time point must contain non-negative finite values");
    }
    const previous = this.scopedTimePoint;
    this.scopedTimePoint = { ...timePoint };
    try {
      return operation();
    } finally {
      this.scopedTimePoint = previous;
    }
  }

  resetSequence(): void {
    // Sequence numbers are session-scoped and restart only during explicit cleanup.
    this.sequence.reset();
  }

  createBehaviorEvent<TEventType extends VisionBehaviorEventType>(
    eventType: TEventType,
    options: CreateBehaviorEventOptions<TEventType>,
  ): VisionBehaviorEventFor<TEventType> {
    return {
      ...this.createEnvelope(
        eventType,
        options.confidence,
        options.confidenceDetails,
      ),
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
      ...this.createEnvelope(
        "VISION_METRIC_SNAPSHOT",
        options.confidence,
        options.confidenceDetails,
      ),
      kind: "metric",
      source: "VISION_PIPELINE",
      payload: options.payload,
    };
  }

  private createEnvelope<TEventType extends string>(
    eventType: TEventType,
    confidence: number,
    details: EventConfidenceDetails = {},
  ): Omit<VisionEventEnvelope<TEventType>, "source"> {
    // Frame-scoped time wins over wall-time sampling to keep a multi-event frame exact.
    const timePoint = this.scopedTimePoint ?? this.timeline.now();

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
      measurementConfidence:
        details.measurementConfidence ?? confidence,
      signalClarity: details.signalClarity ?? confidence,
      personalizationConfidence:
        details.personalizationConfidence ?? 1,
      evidenceStrength: details.evidenceStrength ?? confidence,
      baselineMode: details.baselineMode ?? "PERSONALIZED",
      coachingEligible: details.coachingEligible ?? true,
      baselineEpoch: details.baselineEpoch ?? 0,
      modelVersion: this.versions.modelVersion,
      ruleVersion: this.versions.ruleVersion,
    };
  }
}
