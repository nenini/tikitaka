import type {
  MediaStreamHealth,
  MediaStreamHealthListener,
} from "./MediaStreamHealth.js";

/**
 * Observes a MediaStream that is owned by the WebRTC session layer.
 *
 * The wrapper deliberately never stops the video track. Disposing vision
 * analysis must not turn off the camera used by the active video call.
 */
export class BrowserMediaSource {
  private readonly listeners = new Set<MediaStreamHealthListener>();
  private readonly videoTrack: MediaStreamTrack | null;
  private disposed = false;

  constructor(private readonly stream: MediaStream) {
    this.videoTrack = stream.getVideoTracks()[0] ?? null;
    this.videoTrack?.addEventListener("ended", this.handleTrackChange);
    this.videoTrack?.addEventListener("mute", this.handleTrackChange);
    this.videoTrack?.addEventListener("unmute", this.handleTrackChange);
  }

  getStream(): MediaStream {
    return this.stream;
  }

  getVideoTrack(): MediaStreamTrack | null {
    return this.videoTrack;
  }

  getHealth(): MediaStreamHealth {
    const track = this.videoTrack;

    if (track === null) {
      return {
        state: "NO_VIDEO_TRACK",
        trackId: null,
        enabled: false,
        muted: false,
        readyState: null,
      };
    }

    const state = (() => {
      if (track.readyState === "ended") {
        return "TRACK_ENDED" as const;
      }
      if (!track.enabled) {
        return "CAMERA_DISABLED" as const;
      }
      if (track.muted) {
        return "TRACK_MUTED" as const;
      }
      return "READY" as const;
    })();

    return {
      state,
      trackId: track.id,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
    };
  }

  subscribe(listener: MediaStreamHealthListener): () => void {
    if (this.disposed) {
      throw new Error("BrowserMediaSource is disposed");
    }

    this.listeners.add(listener);
    listener(this.getHealth());

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Removes observers only; ownership of the MediaStream remains with WebRTC. */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.videoTrack?.removeEventListener("ended", this.handleTrackChange);
    this.videoTrack?.removeEventListener("mute", this.handleTrackChange);
    this.videoTrack?.removeEventListener("unmute", this.handleTrackChange);
    this.listeners.clear();
  }

  private readonly handleTrackChange = (): void => {
    const health = this.getHealth();
    for (const listener of this.listeners) {
      listener(health);
    }
  };
}

