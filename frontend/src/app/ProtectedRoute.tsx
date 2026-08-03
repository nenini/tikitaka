import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { SPLASH_SEEN_KEY } from '@/features/auth/SplashPage'

/** 온보딩 미완료 사용자를 되돌려보낼 첫 단계(W-02 KYC). 이후 동의→프로필→설문으로 이어진다. */
const ONBOARDING_ENTRY = '/signup/verify'

/** 이 세션에서 스플래시를 이미 봤는지. (스토리지 불가 환경이면 본 것으로 간주해 건너뛴다) */
function splashSeen() {
  try {
    return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

/**
 * 인증 + 온보딩 게이트.
 *
 * 판정 순서가 중요하다.
 * 1) 세션 첫 진입 → **로그인 여부와 무관하게** 스플래시.
 *    이미 로그인된 사용자도 서비스 첫 화면은 스플래시여야 하고, 스플래시의 3초는
 *    부팅 시 hydrate() 가 신원·온보딩 상태를 채우는 시간을 겸한다.
 * 2) 미로그인 → 랜딩·로그인.
 * 3) 로그인했지만 기본 프로필이 없음 → 온보딩 첫 단계로.
 *    소셜 로그인은 가입 폼을 거치지 않아 프로필·동의·KYC 가 비어 있으므로,
 *    이메일 가입자까지 한곳에서 막으려면 라우트 가드에 두는 게 맞다.
 *
 * 스플래시·온보딩 화면(`/splash`, `/signup/*`)은 이 가드 밖 공개 라우트라
 * 리다이렉트 루프가 생기지 않는다.
 * `unknown`(조회 전·판단 불가)은 통과시킨다 — 일시적 장애로 사용자를 가두지 않기
 * 위함이고, 매칭 등 실제 기능은 백엔드가 다시 막는다.
 */
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const onboarding = useAuthStore((s) => s.onboarding)
  const user = useAuthStore((s) => s.user)

  // 로그인 상태보다 먼저 판정해야 기존 로그인 사용자도 스플래시를 본다
  if (!splashSeen()) return <Navigate to="/splash" replace />

  if (!isAuthenticated) return <Navigate to="/login" replace />

  // 운영자는 서비스 이용자가 아니므로 온보딩(프로필·설문)을 요구하지 않는다.
  const isAdmin = user?.role === 'ADMIN'
  if (!isAdmin && onboarding === 'needs-profile') return <Navigate to={ONBOARDING_ENTRY} replace />

  return <Outlet />
}
