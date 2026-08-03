import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { SPLASH_SEEN_KEY } from '@/features/auth/SplashPage'

/** 이 세션에서 스플래시를 이미 봤는지. (스토리지 불가 환경이면 본 것으로 간주해 건너뛴다) */
function splashSeen() {
  try {
    return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

/**
 * 인증이 필요한 라우트 보호.
 * 미로그인 시 → 세션 첫 진입이면 스플래시, 그 이후엔 곧바로 랜딩·로그인.
 */
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Outlet />
  return <Navigate to={splashSeen() ? '/login' : '/splash'} replace />
}
