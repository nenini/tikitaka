import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Callout, Card, Field, Input, Stack } from '@/components'
import { useAuthStore } from '@/stores/auth.store'
import { authErrorMessage, login, oauthStart } from './api'
import type { OAuthProviderId } from './types'

/* -------------------------------------------------------------------------- */
/*  W-01 · 랜딩 · 로그인 (AUTH-01)                                              */
/*  - 랜딩 히어로 + 로그인 카드를 한 화면에 (와이어프레임 W-01)                  */
/*  - 모바일/PC 반응형 · 레이아웃은 Tailwind, 컴포넌트는 공용 래퍼               */
/*  - 레이아웃 옵션(분할형/중앙형)은 개발 중 하단 컨트롤로 전환해 비교한다.       */
/*    → 확정되면 LayoutToggle 과 useState 를 제거하고 한 쪽으로 고정.           */
/* -------------------------------------------------------------------------- */

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
})
type LoginForm = z.infer<typeof loginSchema>

type Layout = 'split' | 'centered'

export function LoginPage() {
  const [layout, setLayout] = useState<Layout>('split')

  return (
    <div className="min-h-dvh">
      {layout === 'split' ? <SplitLayout /> : <CenteredLayout />}
      {import.meta.env.DEV && <LayoutToggle value={layout} onChange={setLayout} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  레이아웃 A · 분할형 — 데스크탑: 좌 히어로 / 우 폼, 모바일: 세로 스택         */
/*  진입 연출: 히어로 사진이 화면을 꽉 채웠다가(풀블리드) 좌측 패널 폭으로        */
/*  자연스럽게 줄어들며 정착 → 우측 로그인 섹션이 뒤이어 드러난다.               */
/*  최종 상태는 기존 분할 레이아웃과 동일(연출은 진입 순간에만).                  */
/* -------------------------------------------------------------------------- */

/** 인트로 타이밍(ms) — 풀블리드 유지 → 정착 트랜지션 길이 */
const INTRO_HOLD = 820
const SETTLE_MS = 1050

/** 정착 시점에 맞춰 아래→위로 떠오르는 리빌 스타일. */
function reveal(on: boolean, delay: number): CSSProperties {
  return {
    opacity: on ? 1 : 0,
    transform: on ? 'none' : 'translateY(14px)',
    transition: `opacity 560ms ${delay}ms ease-out, transform 560ms ${delay}ms cubic-bezier(.22,1,.36,1)`,
  }
}

function SplitLayout() {
  // mounted: 첫 페인트 직후(브랜드 마크 먼저 등장) / settled: 좌측 패널로 정착 완료
  const [mounted, setMounted] = useState(false)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    // 모바일(세로 스택)·모션 최소화 선호 시에는 연출 없이 최종 상태로 시작한다
    const skip =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(min-width: 1024px)').matches
    if (skip) {
      setSettled(true)
      return () => cancelAnimationFrame(raf)
    }
    const timer = window.setTimeout(() => setSettled(true), INTRO_HOLD)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <main
      className="flex min-h-dvh flex-col lg:grid"
      style={{
        // 1fr 0fr(풀블리드) → 1.05fr 1fr(분할). 모바일은 flex-col 이라 이 값이 무시된다.
        gridTemplateColumns: settled ? '1.05fr 1fr' : '1fr 0fr',
        transition: `grid-template-columns ${SETTLE_MS}ms cubic-bezier(.65,0,.2,1)`,
      }}
    >
      <HeroPanel mounted={mounted} settled={settled} />
      {/* 폭이 0 인 동안 폼이 삐져나오지 않도록 overflow-hidden */}
      <section
        className="flex flex-1 items-center justify-center overflow-hidden bg-bg px-5 py-10 sm:px-8"
        style={{
          opacity: settled ? 1 : 0,
          transform: settled ? 'none' : 'translateX(28px)',
          transition:
            'opacity 620ms 380ms ease-out, transform 620ms 380ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div className="w-full max-w-[420px]">
          <LoginCard />
        </div>
      </section>
    </main>
  )
}

/**
 * 좌측(모바일은 상단) 브랜드 히어로 패널.
 * 배경 사진은 cover 라 패널 폭이 줄면 자동으로 다시 크롭된다 — 정착 연출이 자연스럽게 이어진다.
 */
function HeroPanel({ mounted, settled }: { mounted: boolean; settled: boolean }) {
  return (
    <section
      className="relative flex min-w-0 flex-col justify-center overflow-hidden px-6 py-10 text-white sm:px-10 lg:px-14 lg:py-16"
      style={{
        // 히어로 사진(public/hero-couple.webp · 스플래시와 동일 파일이라 캐시 재사용) · 없을 때 브랜드 그라데이션 폴백
        background:
          "url('/hero-couple.webp') center / cover no-repeat, " +
          'linear-gradient(158deg, var(--bt-color-action) 0%, var(--bt-color-brand) 52%, var(--bt-blue-400) 100%)',
      }}
    >
      {/* 가독용 스크림 — 풀블리드 구간엔 옅게(사진을 보여주고), 정착 후엔 짙게(텍스트 가독) */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(158deg, rgba(24,12,20,.62) 0%, rgba(24,12,20,.28) 42%, rgba(24,12,20,.68) 100%)',
          opacity: settled ? 1 : 0.45,
          transition: `opacity ${SETTLE_MS}ms ease-out`,
        }}
      />
      <div className="relative z-10 max-w-[520px]">
        {/* 서비스명은 풀블리드 구간에서 먼저 등장 */}
        <div style={reveal(mounted, 120)}>
          <BrandMark tone="light" />
        </div>
        <span
          className="bt-caption mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold"
          style={{ background: 'rgba(255,255,255,.18)', color: '#fff', ...reveal(settled, 120) }}
        >
          낯선 사람과의 대화, 연습이 됩니다
        </span>
        <h1
          className="mt-4 text-[28px] font-bold leading-[1.25] tracking-[-0.02em] sm:text-[34px] lg:text-[40px]"
          style={reveal(settled, 200)}
        >
          30분 모의 소개팅으로
          <br />
          대화 습관을 바꿔보세요
        </h1>
        <p
          className="mt-4 max-w-[440px] text-[15px] leading-[1.65] text-white/85"
          style={reveal(settled, 290)}
        >
          실제 소개팅 전에 연습하고, AI 코칭과 상대 피드백으로 {' '}
          <br />
          <b className="font-semibold text-white">내 대화의 강점과 개선점을 확인</b>하세요.
        </p>
        <HeroStats className="mt-8" style={reveal(settled, 380)} />
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  레이아웃 B · 중앙형 — 데스크탑·모바일 모두 중앙 카드                          */
/* -------------------------------------------------------------------------- */
function CenteredLayout() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken px-5 py-10">
      <div className="w-full max-w-[440px]">
        <header className="mb-6 text-center">
          <div className="flex justify-center">
            <BrandMark tone="dark" />
          </div>
          <span
            className="bt-caption mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold"
            style={{
              background: 'var(--bt-color-action-subtle)',
              color: 'var(--bt-color-text-link)',
            }}
          >
            낯선 사람과의 대화, 연습이 됩니다
          </span>
          <h1 className="mt-3 text-[24px] font-bold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[27px]">
            30분 모의 소개팅으로
            <br />
            대화 습관을 바꿔보세요
          </h1>
          <p className="bt-body-sm bt-muted mx-auto mt-2 max-w-[360px]">
            연애 매칭이 아니라 <b className="font-semibold text-ink">대화 연습</b> 서비스예요.
          </p>
        </header>
        <LoginCard />
      </div>
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/*  로그인 카드 — 소셜 + 이메일/비밀번호                                         */
/* -------------------------------------------------------------------------- */
function LoginCard() {
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    setFormError(null)
    try {
      const tokens = await login(data) // POST /v1/auth/login → 토큰 발급
      await signIn(tokens) // 토큰 저장 + GET /v1/users/me 로 신원 하이드레이션
      navigate('/')
    } catch (error) {
      setFormError(authErrorMessage(error) ?? '이메일 또는 비밀번호를 다시 확인해주세요.')
    }
  }

  return (
    <Card>
      <h2 className="bt-h2">시작하기</h2>
      <p className="bt-body-sm bt-muted mt-1">소셜 계정으로 3초 만에, 또는 이메일로.</p>

      <Stack className="mt-5">
        <SocialButtons />

        <div className="my-1 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--bt-color-border)]" />
          <span className="bt-caption">또는</span>
          <span className="h-px flex-1 bg-[var(--bt-color-border)]" />
        </div>

        {/* noValidate: 네이티브 검증을 끄고 RHF+Zod 가 커스텀 메시지를 렌더한다
            (Field required 가 input 에 required 속성을 달아 네이티브 툴팁이 먼저 뜨는 것을 막음) */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack>
            {/* Field 가 id·aria-describedby·aria-invalid 를 Input 에 자동 연결한다 */}
            <Field label="이메일" required error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                {...register('email')}
              />
            </Field>

            <Field label="비밀번호" required error={errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
              />
            </Field>

            <div className="-mt-1 text-right">
              <Link to="/forgot-password" className="bt-caption text-link hover:underline">
                비밀번호를 잊으셨나요?
              </Link>
            </div>

            {formError && <Callout tone="danger">{formError}</Callout>}

            <Button type="submit" variant="primary" size="lg" block loading={isSubmitting}>
              로그인
            </Button>
          </Stack>
        </form>

        {/* 회원가입 진입 — 주 CTA(로그인)와 경쟁하지 않도록 secondary 로 둔다 */}
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--bt-color-border)]" />
          <span className="bt-caption">처음이신가요?</span>
          <span className="h-px flex-1 bg-[var(--bt-color-border)]" />
        </div>
        <Button variant="secondary" size="lg" block onClick={() => navigate('/signup')}>
          이메일로 회원가입
        </Button>
        <p className="bt-caption text-center">만 19세 이상만 가입할 수 있어요.</p>
      </Stack>
    </Card>
  )
}

/**
 * Google · 네이버 소셜 로그인.
 * 계약 준수: Button 은 공개 variant(secondary) 로만 스타일한다. 내부 변수(--_bg 등) 주입 금지.
 * 브랜드색은 접근성 예외(로고타입)인 로고 마크에만 두고, 버튼 자체는 대비가 안전한 secondary 로 둔다.
 */
function SocialButtons() {
  // 클릭 즉시 두 버튼 모두 잠근다. 페이지가 곧 이동하므로 리셋은 불필요하다(unmount 됨).
  // 중복 클릭 시 서버의 state 쿠키가 두 번째 시작으로 덮어써져 첫 이동이 콜백에서
  // INVALID_OAUTH_STATE 로 실패하는 문제를 막는다 — 실제 방지는 oauthStart() 쪽 가드가 하고,
  // 여기서는 그동안 버튼을 눌러도 반응 없어 보이지 않게 로딩 표시만 더한다.
  const [starting, setStarting] = useState<OAuthProviderId | null>(null)
  const start = (provider: OAuthProviderId) => {
    if (starting) return
    setStarting(provider)
    oauthStart(provider)
  }

  return (
    <Stack gap={8}>
      <Button
        variant="secondary"
        size="lg"
        block
        loading={starting === 'google'}
        disabled={starting !== null && starting !== 'google'}
        onClick={() => start('google')}
      >
        <GoogleGlyph />
        Google로 계속하기
      </Button>
      <Button
        variant="secondary"
        size="lg"
        block
        loading={starting === 'naver'}
        disabled={starting !== null && starting !== 'naver'}
        onClick={() => start('naver')}
      >
        <NaverGlyph />
        네이버로 계속하기
      </Button>
    </Stack>
  )
}

/* -------------------------------------------------------------------------- */
/*  프리미티브                                                                 */
/* -------------------------------------------------------------------------- */
/**
 * 브랜드 락업 — 로고 마크(하트 말풍선 'tika') + 국문 워드마크.
 * 마크는 장식이므로 alt=""(aria-hidden), 서비스명은 옆 텍스트가 읽힌다.
 */
function BrandMark({ tone }: { tone: 'light' | 'dark' }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.02em]"
      style={{ color: tone === 'light' ? '#fff' : 'var(--bt-color-text)' }}
    >
      <img
        src="/tika-logo-whitever.webp"
        alt=""
        aria-hidden="true"
        width={41}
        height={28}
        className="h-7 w-auto"
        // 사진 위(light)에서는 흰 로고가 배경에 묻히지 않도록 그림자로 분리한다
        style={tone === 'light' ? { filter: 'drop-shadow(0 2px 7px rgba(0,0,0,.45))' } : undefined}
      />
      티키타카
    </span>
  )
}

function HeroStats({ className = '', style }: { className?: string; style?: CSSProperties }) {
  const stats = [
    { v: '30분', k: '화상 세션' },
    { v: '실시간', k: 'AI 코칭' },
    { v: '상호', k: '행동 피드백' },
  ]
  return (
    <dl className={`flex gap-6 ${className}`} style={style}>
      {stats.map((s) => (
        <div key={s.k} className="flex flex-col">
          <dt className="bt-numeric text-[20px] font-bold leading-none">{s.v}</dt>
          <dd className="mt-1 text-[12px] text-white/80">{s.k}</dd>
        </div>
      ))}
    </dl>
  )
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}

/** 네이버 로고 마크(로고타입 — 대비 예외). 브랜드 그린은 여기에만 둔다. */
function NaverGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <rect width="18" height="18" rx="4" fill="#03C75A" />
      <path fill="#fff" d="M10.3 9.35 7.5 5.2H5.2v7.6h2.5V8.65l2.8 4.15h2.3V5.2h-2.5v4.15z" />
    </svg>
  )
}

/** 개발 전용 — 레이아웃 옵션 미리보기 스위처 (확정 후 제거) */
function LayoutToggle({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  const options: { id: Layout; label: string }[] = [
    { id: 'split', label: '분할형' },
    { id: 'centered', label: '중앙형' },
  ]
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div
        className="flex items-center gap-1 rounded-full p-1 shadow-lg"
        style={{ background: 'var(--bt-color-surface)', border: '1px solid var(--bt-color-border)' }}
      >
        <span className="bt-caption px-2">레이아웃</span>
        {options.map((o) => (
          <Button
            key={o.id}
            size="sm"
            variant={value === o.id ? 'primary' : 'ghost'}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
