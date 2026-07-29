// features/session/livekit/TrackView.tsx
import { useEffect, useRef } from 'react'
import type { LocalVideoTrack, RemoteAudioTrack, RemoteVideoTrack } from 'livekit-client'

export function VideoTrackView({
    track,
    mirror = false,
}: {
    track: LocalVideoTrack | RemoteVideoTrack | null
    /** 내 화면 좌우반전 */
    mirror?: boolean
}) {
    const ref = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el || !track) return
        track.attach(el)
        return () => {
            track.detach(el)
        }
    }, [track])

    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            // 로컬 video 엘리먼트는 항상 muted!
            muted
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                background: 'var(--bt-mist-950)',
                transform: mirror ? 'scaleX(-1)' : undefined,
            }}
        />
    )
}

/** 상대 오디오는 별도 audio 엘리먼트로 재생 */
export function AudioTrackView({ track }: { track: RemoteAudioTrack | null }) {
    const ref = useRef<HTMLAudioElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el || !track) return
        track.attach(el)
        return () => {
            track.detach(el)
        }
    }, [track])

    return <audio ref={ref} autoPlay />
}