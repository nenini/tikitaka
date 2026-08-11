import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

/**
 * ADMIN 롤 전용 라우트 가드.
 * - 미인증 → /login
 * - 인증됐지만 유저 하이드레이션 전(user=null) → 잠깐 대기(리다이렉트 깜빡임 방지)
 * - 비관리자(role !== 'ADMIN') → 홈으로
 */
export function AdminProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="bt-body-sm bt-muted">권한 확인 중…</p>
      </main>
    )
  }
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return <Outlet />
}
