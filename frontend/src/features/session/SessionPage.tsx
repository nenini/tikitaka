import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertDialog, CallControls, ConnectionIndicator, DarkScope, SessionTimer } from '@/components'
import { useSessionStore } from '@/stores/session.store'

/**
 * WebRTC 30분 화상 세션 (SESSION-01). FE-A 가 구현.
 * 디자인 시스템 §7.3: 세션 화면은 OS 설정과 무관하게 항상 다크로 고정한다 → DarkScope.
 */
export function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { localMicOn, localCamOn, toggleMic, toggleCam } = useSessionStore()
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)

  return (
    <DarkScope className="flex flex-col">
      {/* 상단: 타이머 + 연결 상태. 통화 종료와 네트워크 단절은 다른 사건이므로 따로 보여준다. */}
      <header className="flex items-center justify-center gap-3 p-4">
        <SessionTimer remainingSec={29 * 60 + 41} label="남은 시간" />
        <ConnectionIndicator state="connected" />
      </header>

      {/* 상대 영상 (placeholder) */}
      <section className="flex flex-1 items-center justify-center">
        <p className="bt-muted">상대 영상 (id: {sessionId}) — WebRTC 연결 예정</p>
      </section>

      <footer className="flex justify-center p-6">
        <CallControls
          muted={!localMicOn}
          cameraDisabled={!localCamOn}
          onToggleMute={toggleMic}
          onToggleCamera={toggleCam}
          onEnd={() => setEndConfirmOpen(true)}
        />
      </footer>

      <AlertDialog
        open={endConfirmOpen}
        onCancel={() => setEndConfirmOpen(false)}
        onConfirm={() => navigate('/')}
        title="세션을 종료할까요?"
        description="지금 종료하면 남은 시간은 복구되지 않아요. 분석 리포트는 여기까지의 대화로 만들어집니다."
        tone="danger"
        confirmLabel="종료하기"
        confirmIcon="phone-end"
      />
    </DarkScope>
  )
}
