import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

/** 소셜 신규 가입자가 이어서 밟아야 할 온보딩 첫 단계(W-02 KYC). */
const ONBOARDING_ENTRY = '/signup/verify'

/**
 * OAuth 콜백 수신 (AUTH-02).
 * 백엔드 콜백이 `/oauth/callback#accessToken=...&refreshToken=...` 로 302 리다이렉트하면
 * 여기서 해시의 토큰을 꺼내 저장하고 /me 로 신원을 하이드레이션한다.
 * 토큰은 해시라 서버로 전송되지 않으며, 수신 즉시 URL 에서 지운다.
 *
 * 이동 분기 — 소셜 로그인은 가입 폼을 거치지 않아 프로필이 비어 있을 수 있다.
 *  · 기존 회원(프로필 있음) → 홈
 *  · 신규(프로필 없음)      → 온보딩 첫 단계로 **바로** 이동
 * ProtectedRoute 에도 같은 게이트가 있지만, 여기서 먼저 보내야 홈을 한 번
 * 거쳤다가 튕기는 깜빡임이 없다.
 */
export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // StrictMode 이중 실행 가드
    ran.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('accessToken')
    const refreshToken = params.get('refreshToken')

    // 토큰을 URL 에서 즉시 제거(브라우저 히스토리·화면 노출 방지)
    history.replaceState(null, '', window.location.pathname)

    if (!accessToken || !refreshToken) {
      setError('토큰을 받지 못했습니다. 다시 로그인해주세요.')
      return
    }

    signIn({
      tokenType: params.get('tokenType') ?? 'Bearer',
      accessToken,
      refreshToken,
      accessTokenExpiresIn: Number(params.get('accessTokenExpiresIn') ?? 0),
      refreshTokenExpiresIn: Number(params.get('refreshTokenExpiresIn') ?? 0),
    })
      .then(() => {
        // signIn 이 온보딩 상태까지 채운 뒤이므로 스토어에서 바로 읽는다
        const { onboarding } = useAuthStore.getState()
        navigate(onboarding === 'needs-profile' ? ONBOARDING_ENTRY : '/', { replace: true })
      })
      .catch(() => setError('로그인 처리 중 문제가 발생했습니다. 다시 시도해주세요.'))
  }, [navigate, signIn])

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p className="bt-body-sm text-red-400">{error}</p>
          <button className="bt-body-sm underline" onClick={() => navigate('/login', { replace: true })}>
            로그인으로 돌아가기
          </button>
        </>
      ) : (
        <p className="bt-body-sm bt-muted">로그인 처리 중…</p>
      )}
    </main>
  )
}
