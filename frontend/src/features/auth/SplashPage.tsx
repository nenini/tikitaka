import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

/* -------------------------------------------------------------------------- */
/*  스플래시 스크린 — 서비스 진입 시 가장 먼저 마주하는 화면                     */
/*  1차 확정 옵션:                                                             */
/*   ① 히어로 사진 풀블리드(문구 없음 · 사진만)                                 */
/*   ② 정중앙 START — 배경 없는 투명 텍스트                                     */
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
      className="tk-brand-scope relative flex min-h-dvh items-center justify-center overflow-hidden"
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
            'linear-gradient(180deg, rgba(3,12,8,.28) 0%, rgba(3,12,8,.04) 48%, rgba(3,12,8,.58) 100%), radial-gradient(60% 45% at 50% 50%, rgba(3,12,8,.30) 0%, rgba(3,12,8,.08) 60%, rgba(3,12,8,0) 100%)',
        }}
      />

      <div className="absolute left-1/2 top-[max(1.5rem,env(safe-area-inset-top))] z-10 -translate-x-1/2 text-white">
        <span className="inline-flex items-center gap-2 text-[17px] font-bold tracking-[-0.04em]">
          <img
            src="/tika-logo-whitever.webp"
            alt=""
            aria-hidden="true"
            width={82}
            height={48}
            className="h-7 w-auto drop-shadow-lg"
          />
          티키타카
        </span>
      </div>

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
        <span className="mb-2 font-serif text-[14px] italic tracking-[0.08em] text-white/75">
          Practice · Connect · Bloom
        </span>
        <span
          className="select-none text-[24px] font-light sm:text-[28px]"
          style={{
            letterSpacing: '0.42em',
            // 마지막 글자 뒤 자간까지 더해지는 것을 상쇄해 시각적 중앙을 맞춘다
            textIndent: '0.42em',
            textShadow: '0 2px 18px rgba(0,0,0,.45)',
          }}
        >
          시작하기
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

      <p className="absolute bottom-[max(1.75rem,env(safe-area-inset-bottom))] left-1/2 z-10 w-full -translate-x-1/2 px-6 text-center text-[12px] leading-5 text-white/70">
        30분의 대화 연습이 오늘의 자신감을 만듭니다
      </p>
    </main>
  )
}
