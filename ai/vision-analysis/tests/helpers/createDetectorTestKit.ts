import { SystemClock } from "../../src/common/Clock.js";
import { MonotonicSequenceGenerator } from "../../src/common/SequenceGenerator.js";
import { SessionTimeline } from "../../src/common/SessionTimeline.js";
import { VisionEventFactory } from "../../src/vision/events/VisionEventFactory.js";

export function createDetectorEventFactory(): VisionEventFactory {
  const clock = new SystemClock();
  return new VisionEventFactory(
    { sessionId: "test-session", userId: "test-user", clientInstanceId: "test-client" },
    { modelVersion: "test-model", ruleVersion: "test-rules" },
    new SessionTimeline({ sessionElapsedMsAtSync: 0, clientMonotonicMsAtSync: performance.now() }, clock),
    clock,
    new MonotonicSequenceGenerator(),
    () => crypto.randomUUID(),
  );
}
