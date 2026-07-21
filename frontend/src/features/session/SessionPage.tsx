import { useNavigate, useParams } from 'react-router-dom'
import { useSessionStore } from '@/stores/session.store'

/**
 * WebRTC 30분 화상 세션 (SESSION-01). FE-A 가 구현.
 * 디자인 시스템 §7.3: 세션 화면은 OS 설정과 무관하게 항상 다크로 고정한다.
 * data-theme="dark" 를 컨테이너에 걸고, 경계에서 color/background 를 다시 잡는다.
 */
export function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { localMicOn, localCamOn, toggleMic, toggleCam } = useSessionStore()

  return (
    <div
      data-theme="dark"
      className="flex h-full flex-col bg-bg text-ink"
    >
      {/* 상단: 타이머 */}
      <header className="flex justify-center p-4">
        <span className="bt-timer">
          <span className="bt-timer__dot" />
          <span className="bt-numeric">29:41</span>
        </span>
      </header>

      {/* 상대 영상 (placeholder) */}
      <section className="flex flex-1 items-center justify-center">
        <p className="bt-muted">상대 영상 (id: {sessionId}) — WebRTC 연결 예정</p>
      </section>

      {/* 하단: 통화 컨트롤 바 */}
      <footer className="flex justify-center p-6">
        <div className="bt-call-bar">
          <button
            className={`bt-icon-btn ${localMicOn ? 'bt-icon-btn--on' : 'bt-icon-btn--off'}`}
            aria-pressed={localMicOn}
            aria-label={localMicOn ? '마이크 끄기' : '마이크 켜기'}
            onClick={toggleMic}
          >
            {localMicOn ? '🎙' : '🔇'}
          </button>
          <button
            className={`bt-icon-btn ${localCamOn ? 'bt-icon-btn--on' : 'bt-icon-btn--off'}`}
            aria-pressed={localCamOn}
            aria-label={localCamOn ? '카메라 끄기' : '카메라 켜기'}
            onClick={toggleCam}
          >
            {localCamOn ? '📷' : '🚫'}
          </button>
          {/* 파괴적 액션: 아이콘만 허용되는 유일한 예외(학습된 관습) */}
          <button
            className="bt-icon-btn bt-icon-btn--end"
            aria-label="세션 종료"
            onClick={() => navigate('/')}
          >
            ✕
          </button>
        </div>
      </footer>
    </div>
  )
}
