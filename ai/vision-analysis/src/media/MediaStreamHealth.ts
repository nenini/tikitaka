export const MEDIA_STREAM_HEALTH_STATES = [
  "READY",
  "CAMERA_DISABLED",
  "TRACK_MUTED",
  "TRACK_ENDED",
  "NO_VIDEO_TRACK",
] as const;

export type MediaStreamHealthState =
  (typeof MEDIA_STREAM_HEALTH_STATES)[number];

/** A privacy-safe snapshot of local camera availability. */
export interface MediaStreamHealth {
  readonly state: MediaStreamHealthState;
  readonly trackId: string | null;
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly readyState: MediaStreamTrackState | null;
}

export type MediaStreamHealthListener = (health: MediaStreamHealth) => void;

