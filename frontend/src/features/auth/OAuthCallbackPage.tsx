import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import type { AuthTokens } from './types'

/* -------------------------------------------------------------------------- */
/*  OAuth 콜백 수신 (갭 B 해소)                                                 */
/*  백엔드가 소셜 로그인 성공 후 302로 이 라우트로 되돌려보내며,                  */
/*  토큰을 URL 프래그먼트(#accessToken=...&refreshToken=...)에 실어 전달한다.     */
/*  프래그먼트는 서버로 전송되지 않으므로 토큰이 로그/프록시에 남지 않는다.        */
/* -------------------------------------------------------------------------- */
export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // StrictMode 이중 실행 가드
    ran.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('accessToken')
    const refreshToken = params.get('refreshToken')

    if (!accessToken || !refreshToken) {
      navigate('/login?error=oauth', { replace: true })
      return
    }

    const tokens: AuthTokens = {
      tokenType: params.get('tokenType') ?? 'Bearer',
      accessToken,
      refreshToken,
      accessTokenExpiresIn: Number(params.get('expiresIn') ?? 0),
      refreshTokenExpiresIn: 0,
    }

    // 뒤로가기 시 토큰 프래그먼트가 다시 노출되지 않도록 히스토리에서 제거
    window.history.replaceState(null, '', '/oauth/callback')

    signIn(tokens)
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/login?error=oauth', { replace: true }))
  }, [navigate, signIn])

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="bt-body bt-muted">로그인 처리 중…</p>
    </main>
  )
}
