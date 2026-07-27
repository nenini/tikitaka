// features/session/LiveKitDemoPage.tsx
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, CallControls, ConnectionIndicator, DarkScope, Callout } from '@/components'
import { useLiveKitRoom } from './livekit/useLiveKitRoom'
import { devTokenProvider } from './livekit/tokenProvider'
import { AudioTrackView, VideoTrackView } from './livekit/TrackView'

export function LiveKitDemoPage() {
    const navigate = useNavigate()
    // 모듈 상수로 렌더마다 재실행 방지
    const getToken = useCallback(devTokenProvider, [])
    const s = useLiveKitRoom('demo-room', getToken)

    return (
        <DarkScope>
            <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 16, minHeight: '100dvh', padding: 24 }}>
                <header style={{ display: 'flex', justifyContent: 'center' }}>
                    <ConnectionIndicator state={s.state} />
                </header>

                <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minHeight: 0 }}>
                    <div style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <VideoTrackView track={s.remoteVideo} />
                    </div>
                    <div style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <VideoTrackView track={s.localVideo} mirror />
                    </div>
                    <AudioTrackView track={s.remoteAudio} />
                </section>

                <footer style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
                    {s.error && <Callout tone="danger">{s.error.message}</Callout>}
                    {s.needsAudioUnlock && (
                        <Button variant="tonal" onClick={s.unlockAudio}>
                            소리 켜기
                        </Button>
                    )}
                    <CallControls
                        muted={s.muted}
                        cameraDisabled={s.cameraDisabled}
                        mutePending={s.mutePending}
                        cameraPending={s.cameraPending}
                        onToggleMute={s.toggleMute}
                        onToggleCamera={s.toggleCamera}
                        onEnd={() => {
                            s.disconnect()
                            navigate('/')
                        }}
                    />
                </footer>
            </div>
        </DarkScope>
    )
}