import { useCallback, useEffect, useRef, useState } from 'react'
import {
    ConnectionQuality,
    ConnectionState,
    RemoteTrack,
    Room,
    RoomEvent,
    Track,
} from 'livekit-client'
import type { LocalVideoTrack, RemoteAudioTrack, RemoteVideoTrack } from 'livekit-client'
import type { ConnectionState as BtConnectionState } from '@/components'
import { toBtState } from './connectionState'
import type { TokenProvider } from './tokenProvider'

export interface LiveKitSession {
    state: BtConnectionState
    localVideo: LocalVideoTrack | null  /** 내 카메라 트랙 */
    remoteVideo: RemoteVideoTrack | null
    remoteAudio: RemoteAudioTrack | null
    muted: boolean
    cameraDisabled: boolean
    mutePending: boolean
    cameraPending: boolean
    toggleMute: () => void
    toggleCamera: () => void
    disconnect: () => void
    needsAudioUnlock: boolean /** 브라우저 자동재생 정책으로 소리가 막혔을 때 true*/
    unlockAudio: () => void
    error: Error | null
}

export function useLiveKitRoom(roomName: string, getToken: TokenProvider): LiveKitSession {
    const [state, setState] = useState<BtConnectionState>('connecting')
    const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null)
    const [remoteVideo, setRemoteVideo] = useState<RemoteVideoTrack | null>(null)
    const [remoteAudio, setRemoteAudio] = useState<RemoteAudioTrack | null>(null)
    const [muted, setMuted] = useState(false)
    const [cameraDisabled, setCameraDisabled] = useState(false)
    const [mutePending, setMutePending] = useState(false)
    const [cameraPending, setCameraPending] = useState(false)
    const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    // 토글 콜백이 항상 살아있는 Room 을 참조하도록 ref로
    const roomRef = useRef<Room | null>(null)

    useEffect(() => {
        let cancelled = false
        // Room 은 disconnect 후 재사용하지 않는다 — effect 마다 새로 만든다(StrictMode 이중 실행 대응).
        const room = new Room({
            adaptiveStream: true, // 화면에 안 보이는 트랙은 자동으로 화질을 낮춘다
            dynacast: true, // 아무도 구독하지 않는 레이어는 발행을 멈춘다
        })
        roomRef.current = room

        // 연결 상태 + 품질 같이 확인
        let quality: ConnectionQuality = ConnectionQuality.Unknown
        const syncState = () => {
            if (!cancelled) setState(toBtState(room.state, quality))
        }

        const onTrackSubscribed = (track: RemoteTrack) => {
            if (cancelled) return
            if (track.kind === Track.Kind.Video) setRemoteVideo(track as RemoteVideoTrack)
            if (track.kind === Track.Kind.Audio) setRemoteAudio(track as RemoteAudioTrack)
        }
        const onTrackUnsubscribed = (track: RemoteTrack) => {
            if (cancelled) return
            if (track.kind === Track.Kind.Video) setRemoteVideo(null)
            if (track.kind === Track.Kind.Audio) setRemoteAudio(null)
        }

        room
            .on(RoomEvent.ConnectionStateChanged, syncState)
            .on(RoomEvent.ConnectionQualityChanged, (q, participant) => {
                // 내 품질만 봄
                if (participant?.isLocal) {
                    quality = q
                    syncState()
                }
            })
            .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
            .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
            .on(RoomEvent.ParticipantDisconnected, () => {
                // 상대 이탈 — 연결 끊김(내 네트워크 문제)과 구분해서 트랙만 비운다
                if (cancelled) return
                setRemoteVideo(null)
                setRemoteAudio(null)
            })
            .on(RoomEvent.LocalTrackPublished, (pub) => {
                if (!cancelled && pub.track?.kind === Track.Kind.Video) {
                    setLocalVideo(pub.track as LocalVideoTrack)
                }
            })
            .on(RoomEvent.LocalTrackUnpublished, (pub) => {
                if (!cancelled && pub.track?.kind === Track.Kind.Video) setLocalVideo(null)
            })
            // 자동재생 정책으로 소리가 막히면 사용자 제스처가 필요하다.
            .on(RoomEvent.AudioPlaybackStatusChanged, () => {
                if (!cancelled) setNeedsAudioUnlock(!room.canPlaybackAudio)
            })

        async function start() {
            try {
                const { serverUrl, token } = await getToken(roomName)
                if (cancelled) return

                await room.connect(serverUrl, token)
                if (cancelled) return

                // 접속 후 내 장치를 켠다. 권한 거부는 여기서 throw
                await room.localParticipant.setMicrophoneEnabled(true)
                await room.localParticipant.setCameraEnabled(true)
                if (cancelled) return

                setMuted(!room.localParticipant.isMicrophoneEnabled)
                setCameraDisabled(!room.localParticipant.isCameraEnabled)
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err : new Error(String(err)))
                setState('disconnected')
            }
        }
        void start()

        return () => {
            cancelled = true
            roomRef.current = null
            room.removeAllListeners()
            // 로컬 트랙 정지(카메라 표시등 OFF)까지 여기서 완료
            void room.disconnect()
        }
    }, [roomName, getToken])

    const toggleMute = useCallback(async () => {
        const room = roomRef.current
        if (!room) return
        setMutePending(true)
        try {
            const next = !muted
            await room.localParticipant.setMicrophoneEnabled(!next)
            setMuted(next)
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)))
        } finally {
            setMutePending(false)
        }
    }, [muted])

    const toggleCamera = useCallback(async () => {
        const room = roomRef.current
        if (!room) return
        setCameraPending(true)
        try {
            const next = !cameraDisabled
            await room.localParticipant.setCameraEnabled(!next)
            setCameraDisabled(next)
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)))
        } finally {
            setCameraPending(false)
        }
    }, [cameraDisabled])

    const disconnect = useCallback(() => {
        void roomRef.current?.disconnect()
    }, [])

    const unlockAudio = useCallback(() => {
        void roomRef.current?.startAudio()
    }, [])

    return {
        state,
        localVideo,
        remoteVideo,
        remoteAudio,
        muted,
        cameraDisabled,
        mutePending,
        cameraPending,
        toggleMute: () => void toggleMute(),
        toggleCamera: () => void toggleCamera(),
        disconnect,
        needsAudioUnlock,
        unlockAudio,
        error,
    }
}
