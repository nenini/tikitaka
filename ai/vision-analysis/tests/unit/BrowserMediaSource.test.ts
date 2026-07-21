import { describe, expect, it } from "vitest";

import { BrowserMediaSource } from "../../src/media/BrowserMediaSource.js";

class FakeVideoTrack extends EventTarget {
  readonly id = "video-track-1";
  enabled = true;
  muted = false;
  readyState: MediaStreamTrackState = "live";
  stopCalls = 0;

  stop(): void {
    this.stopCalls += 1;
    this.readyState = "ended";
  }
}

function createStream(track: FakeVideoTrack): MediaStream {
  return {
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

describe("BrowserMediaSource", () => {
  it("reports track changes without stopping the borrowed WebRTC track", () => {
    const track = new FakeVideoTrack();
    const source = new BrowserMediaSource(createStream(track));
    const states: string[] = [];
    source.subscribe((health) => states.push(health.state));

    track.muted = true;
    track.dispatchEvent(new Event("mute"));
    track.muted = false;
    track.readyState = "ended";
    track.dispatchEvent(new Event("ended"));
    source.dispose();

    expect(states).toEqual(["READY", "TRACK_MUTED", "TRACK_ENDED"]);
    expect(track.stopCalls).toBe(0);
  });

  it("reports a missing video track", () => {
    const stream = { getVideoTracks: () => [] } as unknown as MediaStream;
    const source = new BrowserMediaSource(stream);

    expect(source.getHealth().state).toBe("NO_VIDEO_TRACK");
  });
});

