import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

export function HomePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bt-h1">화상 모의 소개팅</h1>
          <p className="bt-body bt-muted mt-1">
            {user ? `${user.nickname} 님, 반가워요.` : '로그인된 사용자'}
          </p>
        </div>
        <button className="bt-btn bt-btn--ghost bt-btn--sm" onClick={logout}>
          로그아웃
        </button>
      </div>

      <div className="bt-card bt-card--interactive" onClick={() => navigate('/session/demo/room')}>
        <div className="bt-card__head">
          <span className="bt-card__title">대기방 입장 (기기 점검)</span>
          <span className="bt-badge bt-badge--info">P0</span>
        </div>
        <p className="bt-body-sm bt-muted">
          카메라·마이크·스피커를 점검하고 세션에 입장합니다. 통과하면 WebRTC 세션(다크 고정)으로 이어져요.
        </p>
      </div>
    </main>
  )
}
