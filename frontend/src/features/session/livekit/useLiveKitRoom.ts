import { useCallback, useEffect, useRef, useState } from 'react'
import {
    ConnectionQuality,
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
    /**
     * 카메라·마이크 권한이 없어 세션에 들어갈 수 없는 상태.
     * true 면 룸에 **연결되지 않았거나 강제로 끊긴 것**이므로 세션 UI 를 그리면 안 된다.
     */
    mediaDenied: boolean
    /** 권한을 다시 확인하고 입장을 재시도한다 */
    retry: () => void
}

/** 권한 거부·장치 없음을 구분한다. 사용자에게 다른 안내를 해야 한다. */
function isPermissionError(err: unknown): boolean {
    return err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
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
    const [mediaDenied, setMediaDenied] = useState(false)
    // 값이 바뀌면 effect 가 다시 돌아 입장을 재시도한다.
    const [retryNonce, setRetryNonce] = useState(0)

    // 토글 콜백이 항상 살아있는 Room 을 참조하도록 ref로
    const roomRef = useRef<Room | null>(null)

    const retry = useCallback(() => {
        setMediaDenied(false)
        setError(null)
        setState('connecting')
        setRetryNonce((n) => n + 1)
    }, [])

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

        /** 권한이 사라지면 세션에 남아 있으면 안 된다 — 즉시 끊고 차단 상태로 전환한다. */
        function blockForMedia(err: unknown) {
            setMediaDenied(true)
            setError(
                isPermissionError(err)
                    ? new Error('카메라·마이크 권한이 필요해요.')
                    : new Error('카메라 또는 마이크를 찾을 수 없어요.'),
            )
            setState('disconnected')
            void room.disconnect()
        }

        // 세션 도중 브라우저 설정에서 권한을 꺼도 즉시 쫓아내기 위해 권한 상태를 구독한다.
        // Permissions API 의 camera/microphone 은 일부 브라우저(Firefox 등)에서 미지원이라
        // 실패해도 조용히 넘어간다 — 그 경우엔 아래 입장 게이트만으로 막는다.
        const permissionWatchers: PermissionStatus[] = []
        async function watchPermissions() {
            for (const name of ['camera', 'microphone'] as const) {
                try {
                    const status = await navigator.permissions.query({ name: name as PermissionName })
                    if (cancelled) return
                    status.onchange = () => {
                        if (!cancelled && status.state === 'denied') {
                            blockForMedia(new DOMException('permission revoked', 'NotAllowedError'))
                        }
                    }
                    permissionWatchers.push(status)
                } catch {
                    /* 미지원 브라우저 — 입장 게이트로만 막는다 */
                }
            }
        }

        async function start() {
            try {
                // ── 입장 게이트 ──
                // 반드시 **연결 전에** 장치를 확인한다. 예전에는 connect() 뒤에 장치를 켰는데,
                // 그러면 권한이 거부돼도 룸에는 이미 들어간 상태로 남았다(연결됨 + 권한 오류).
                // getUserMedia 는 권한 확인과 요청을 겸하므로 브라우저 구분 없이 동작한다.
                let probe: MediaStream
                try {
                    probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
                } catch (err) {
                    if (cancelled) return
                    // 연결 자체를 시도하지 않는다.
                    setMediaDenied(true)
                    setError(
                        isPermissionError(err)
                            ? new Error('카메라·마이크 권한이 필요해요.')
                            : new Error('카메라 또는 마이크를 찾을 수 없어요.'),
                    )
                    setState('disconnected')
                    return
                }
                // 확인용 트랙은 바로 반납한다. 실제 발행 트랙은 LiveKit 이 다시 잡는다
                // (카메라 표시등이 잠깐 깜빡일 수 있지만, 권한 판정의 정확성을 택했다).
                probe.getTracks().forEach((t) => t.stop())
                if (cancelled) return

                void watchPermissions()

                const { serverUrl, token } = await getToken(roomName)
                if (cancelled) return

                await room.connect(serverUrl, token)
                if (cancelled) return

                // 게이트를 통과했어도 이 사이에 권한이 바뀌었을 수 있다. 실패하면 입장을 취소한다.
                try {
                    await room.localParticipant.setMicrophoneEnabled(true)
                    await room.localParticipant.setCameraEnabled(true)
                } catch (err) {
                    if (cancelled) return
                    blockForMedia(err)
                    return
                }
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
            permissionWatchers.forEach((s) => (s.onchange = null))
            room.removeAllListeners()
            // 로컬 트랙 정지(카메라 표시등 OFF)까지 여기서 완료
            void room.disconnect()
        }
    }, [roomName, getToken, retryNonce])

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
        mediaDenied,
        retry,
    }
}
