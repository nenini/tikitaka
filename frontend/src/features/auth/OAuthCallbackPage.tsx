import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

/**
 * OAuth 콜백 수신 (AUTH-02).
 * 백엔드 콜백이 `/oauth/callback#accessToken=...&refreshToken=...` 로 302 리다이렉트하면
 * 여기서 해시의 토큰을 꺼내 저장하고 /me 로 신원을 하이드레이션한 뒤 홈으로 보낸다.
 * 토큰은 해시라 서버로 전송되지 않으며, 수신 즉시 URL 에서 지운다.
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
      .then(() => navigate('/', { replace: true }))
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
