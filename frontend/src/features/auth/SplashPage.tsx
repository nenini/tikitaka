import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

/* -------------------------------------------------------------------------- */
/*  스플래시 스크린 — 서비스 진입 시 가장 먼저 마주하는 화면                     */
/*  1차 확정 옵션:                                                             */
/*   ① 히어로 사진 풀블리드(문구 없음 · 사진만)                                 */
/*   ② START — 배경 없는 투명 텍스트. 가로 중앙, 세로는 41%(커플 위)            */
/*   ③ 3초 후 자동 이동(누르면 즉시). 인증·온보딩 상태로 분기:                   */
/*      미로그인 → 랜딩·로그인(/login)                                          */
/*      로그인 + 프로필 없음 → 온보딩 첫 단계(/signup/verify)                    */
/*      로그인 + 프로필 있음 → 홈(/)                                            */
/*  - 사진은 다음 화면(W-01 히어로)으로 이어지며 좌측 패널로 정착한다.            */
/* -------------------------------------------------------------------------- */

/** 자동 이동까지 대기 시간(ms). 토큰 검증 여유 시간을 겸한다. */
const AUTO_ADVANCE_MS = 3000
/** 화면 전환 페이드 길이(ms) */
const FADE_OUT_MS = 420
/** 세션당 1회만 노출하기 위한 키. ProtectedRoute 와 공유한다. */
export const SPLASH_SEEN_KEY = 'tk.splash-seen'

export function SplashPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false) // 마운트 직후 페이드 인 + 진행선 시작
  const [leaving, setLeaving] = useState(false)
  const advancedRef = useRef(false) // 클릭과 타이머의 중복 이동 방지

  const advance = useCallback(() => {
    if (advancedRef.current) return
    advancedRef.current = true
    setLeaving(true)
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
    } catch {
      /* 프라이빗 모드 등 스토리지 불가 — 노출 1회 제한만 포기한다 */
    }
    window.setTimeout(() => {
      // 이동 직전에 읽는다 — 3초 동안 hydrate() 가 온보딩 상태를 채웠을 수 있다
      const { isAuthenticated: authed, onboarding, user } = useAuthStore.getState()
      const needsOnboarding = onboarding === 'needs-profile' && user?.role !== 'ADMIN'
      const to = !authed ? '/login' : needsOnboarding ? '/signup/verify' : '/'
      navigate(to, { replace: true })
    }, FADE_OUT_MS)
  }, [navigate])

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true))
    const timer = window.setTimeout(advance, AUTO_ADVANCE_MS)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [advance])

  return (
    <main
      /* pb-[18vh]: START 를 화면 정중앙이 아니라 **세로 41%** 에 세운다.
         히어로 사진의 커플이 세로 48~68% 에 있어, 정중앙에 두면 맞잡은 손과 겹친다.
         패딩으로 미는 이유는 버튼의 transform 이 등장 애니메이션에 이미 쓰이고 있어서다
         (translateY 를 여기서 또 쓰면 둘이 싸운다). */
      className="relative flex min-h-dvh items-center justify-center overflow-hidden pb-[18vh]"
      style={{
        // 히어로 사진 풀블리드(WebP 2560×1440 · 362KB) · 없을 때 브랜드 그라데이션 폴백
        background:
          "url('/hero-couple.webp') center / cover no-repeat, " +
          'linear-gradient(158deg, var(--bt-color-action) 0%, var(--bt-color-brand) 52%, var(--bt-blue-400) 100%)',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms ease-out`,
      }}
    >
      {/* START 가독용 최소 스크림 — 사진을 최대한 살린다 */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            // 초점을 START 와 같은 41% 에 맞춘다 — 50% 에 두면 글자는 스크림 밖에 서고
            // 정작 밝게 살려야 할 커플만 어두워진다.
            'radial-gradient(60% 45% at 50% 41%, rgba(18,9,14,.34) 0%, rgba(18,9,14,.10) 60%, rgba(18,9,14,0) 100%)',
        }}
      />

      <button
        type="button"
        onClick={advance}
        className="relative z-10 flex cursor-pointer flex-col items-center bg-transparent px-6 py-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? 'none' : 'translateY(8px)',
          transition: 'opacity 700ms 160ms ease-out, transform 700ms 160ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        <span
          className="select-none text-[26px] font-light sm:text-[30px]"
          style={{
            letterSpacing: '0.42em',
            // 마지막 글자 뒤 자간까지 더해지는 것을 상쇄해 시각적 중앙을 맞춘다
            textIndent: '0.42em',
            textShadow: '0 2px 18px rgba(0,0,0,.45)',
          }}
        >
          START
        </span>
        {/* 자동 이동까지 남은 시간을 문구 없이 알리는 헤어라인 */}
        <span aria-hidden="true" className="mt-3 block h-px w-[132px] bg-white/25">
          <span
            className="block h-full bg-white/85"
            style={{
              width: ready ? '100%' : '0%',
              transition: `width ${AUTO_ADVANCE_MS}ms linear`,
            }}
          />
        </span>
      </button>
    </main>
  )
}
