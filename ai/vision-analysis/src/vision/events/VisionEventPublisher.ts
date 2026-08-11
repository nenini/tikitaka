import type { Clock } from "../../common/Clock.js";
import type { VisionConfig } from "../config/VisionConfig.js";
import type { VisionEvent } from "./VisionEvent.js";
import type {
  VisionBehaviorEvent,
  VisionMetricSnapshot,
} from "./VisionEvent.js";

export interface VisionPublishResult {
  /** Input events delivered during an immediate publish/flush. */
  readonly acceptedEventIds: readonly string[];
  /** Input events retained in the bounded local buffer. */
  readonly bufferedEventIds: readonly string[];
  readonly droppedEventIds: readonly string[];
}

export interface VisionEventBatch {
  readonly behaviorEvents: readonly VisionBehaviorEvent[];
  readonly metricSnapshots: readonly VisionMetricSnapshot[];
}

/** Adapter boundary implemented by the owning frontend's HTTP or WebSocket layer. */
export interface VisionEventTransport {
  send(batch: VisionEventBatch, signal: AbortSignal): Promise<void>;
}

export interface VisionPublisherCloseOptions {
  /** False is used for consent withdrawal so no buffered data leaves the browser. */
  readonly flush?: boolean;
}

export interface VisionPublisherStats {
  readonly bufferedEvents: number;
  readonly droppedEvents: number;
  readonly closed: boolean;
}

export interface VisionEventPublisher {
  publish(events: readonly VisionEvent[]): Promise<VisionPublishResult>;
  flush(): Promise<void>;
  close(options?: VisionPublisherCloseOptions): Promise<void>;
}

interface BufferedEvent {
  readonly event: VisionEvent;
  readonly bufferedAtMs: number;
}

/**
 * Batches scalar VisionEvents without ever receiving frames or raw model output.
 *
 * Transport failures keep the batch for a later flush. Capacity pressure drops
 * metric snapshots before behavior events because state transitions are more
 * valuable to the Session Aggregator than periodic diagnostics.
 */
export class BufferedVisionEventPublisher implements VisionEventPublisher {
  private buffer: BufferedEvent[] = [];
  private readonly inFlightEventIds = new Set<string>();
  private flushInFlight: Promise<void> | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private activeAbortController: AbortController | null = null;
  private closing = false;
  private closed = false;
  private droppedEvents = 0;

  constructor(
    private readonly transport: VisionEventTransport,
    private readonly config: Pick<VisionConfig, "transport">,
    private readonly clock: Clock,
  ) {}

  async publish(events: readonly VisionEvent[]): Promise<VisionPublishResult> {
    if (this.closing || this.closed) {
      throw new Error("VisionEventPublisher is closed");
    }

    const nowMs = this.clock.monotonicNowMs();
    this.dropExpired(nowMs);
    const droppedInputIds = new Set<string>();

    for (const event of events) {
      if (this.hasEventId(event.eventId)) {
        // eventId is the idempotency key; duplicates must not create coaching noise.
        droppedInputIds.add(event.eventId);
        this.droppedEvents += 1;
        continue;
      }
      this.buffer.push({ event, bufferedAtMs: nowMs });
      this.enforceCapacity(droppedInputIds);
    }

    if (this.config.transport.batchIntervalMs === 0 && this.buffer.length > 0) {
      const candidateIds = new Set(
        events
          .map((event) => event.eventId)
          .filter((eventId) => !droppedInputIds.has(eventId)),
      );
      await this.flush();
      return {
        acceptedEventIds: [...candidateIds],
        bufferedEventIds: [],
        droppedEventIds: [...droppedInputIds],
      };
    }

    if (this.buffer.length > 0) this.scheduleFlush();
    const bufferedIds = new Set(this.buffer.map(({ event }) => event.eventId));
    return {
      acceptedEventIds: [],
      bufferedEventIds: events
        .map((event) => event.eventId)
        .filter((eventId) => bufferedIds.has(eventId)),
      droppedEventIds: [...droppedInputIds],
    };
  }

  flush(): Promise<void> {
    if (this.flushInFlight !== null) return this.flushInFlight;
    this.clearTimer();
    this.dropExpired(this.clock.monotonicNowMs());
    if (this.buffer.length === 0) return Promise.resolve();

    const operation = this.sendCurrentBuffer().finally(() => {
      this.flushInFlight = null;
      if (!this.closing && !this.closed && this.buffer.length > 0) {
        this.scheduleFlush();
      }
    });
    this.flushInFlight = operation;
    return operation;
  }

  async close(options: VisionPublisherCloseOptions = {}): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    this.clearTimer();

    try {
      if (options.flush ?? true) {
        await this.flush();
      } else if (this.flushInFlight !== null) {
        // A frontend fetch adapter can honor this signal to stop an in-flight
        // request when consent is withdrawn.
        this.activeAbortController?.abort();
        await this.flushInFlight.catch(() => undefined);
      }
    } finally {
      // A closed session must not retain baseline-adjacent behavioral history,
      // even when its final network attempt failed.
      this.buffer = [];
      this.inFlightEventIds.clear();
      this.closed = true;
      this.closing = false;
    }
  }

  getStats(): VisionPublisherStats {
    return {
      bufferedEvents: this.buffer.length,
      droppedEvents: this.droppedEvents,
      closed: this.closed,
    };
  }

  private async sendCurrentBuffer(): Promise<void> {
    const pending = this.buffer;
    this.buffer = [];
    for (const { event } of pending) this.inFlightEventIds.add(event.eventId);
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    try {
      const events = pending.map(({ event }) => event);
      await this.transport.send(
        {
          behaviorEvents: events.filter(
            (event): event is VisionBehaviorEvent => event.kind === "behavior",
          ),
          metricSnapshots: events.filter(
            (event): event is VisionMetricSnapshot => event.kind === "metric",
          ),
        },
        abortController.signal,
      );
    } catch (error: unknown) {
      // New events may arrive while a request is in flight, so failed events are
      // restored in front to preserve their session sequence ordering.
      this.buffer = [...pending, ...this.buffer];
      this.dropExpired(this.clock.monotonicNowMs());
      this.enforceCapacity();
      throw error;
    } finally {
      for (const { event } of pending) {
        this.inFlightEventIds.delete(event.eventId);
      }
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }
  }

  private scheduleFlush(): void {
    if (this.timerId !== null || this.closing || this.closed) return;
    this.timerId = setTimeout(() => {
      this.timerId = null;
      // A scheduled transport failure remains buffered; the next interval or
      // explicit flush retries it without leaking diagnostics to console.
      void this.flush().catch(() => undefined);
    }, this.config.transport.batchIntervalMs);
  }

  private clearTimer(): void {
    if (this.timerId === null) return;
    clearTimeout(this.timerId);
    this.timerId = null;
  }

  private dropExpired(nowMs: number): void {
    const oldestAllowedMs = nowMs - this.config.transport.maxBufferedAgeMs;
    const retained = this.buffer.filter(
      ({ bufferedAtMs }) => bufferedAtMs >= oldestAllowedMs,
    );
    this.droppedEvents += this.buffer.length - retained.length;
    this.buffer = retained;
  }

  private enforceCapacity(droppedInputIds?: Set<string>): void {
    while (this.buffer.length > this.config.transport.maxBufferedEvents) {
      const metricIndex = this.buffer.findIndex(
        ({ event }) => event.kind === "metric",
      );
      const dropIndex = metricIndex >= 0 ? metricIndex : 0;
      const [dropped] = this.buffer.splice(dropIndex, 1);
      if (dropped !== undefined) {
        droppedInputIds?.add(dropped.event.eventId);
        this.droppedEvents += 1;
      }
    }
  }

  private hasEventId(eventId: string): boolean {
    return (
      this.inFlightEventIds.has(eventId) ||
      this.buffer.some(({ event }) => event.eventId === eventId)
    );
  }
}
