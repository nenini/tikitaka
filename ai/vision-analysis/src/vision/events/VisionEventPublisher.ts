import type { VisionEvent } from "./VisionEvent.js";

export interface VisionPublishResult {
  readonly acceptedEventIds: readonly string[];
  readonly bufferedEventIds: readonly string[];
  readonly droppedEventIds: readonly string[];
}

export interface VisionEventPublisher {
  publish(events: readonly VisionEvent[]): Promise<VisionPublishResult>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

