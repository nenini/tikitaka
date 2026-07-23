import { useState, type CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Field, Input, Stack } from '@/components'
import { useAuthStore } from '@/stores/auth.store'
import heroImg from '@/assets/hero.png'

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

/** .bt-btn 은 --_bg/--_fg/--_bd 로 색을 받는다. 브랜드 소셜 버튼은 여기에 주입. */
type BrandVars = CSSProperties & Record<'--_bg' | '--_fg' | '--_bd', string>

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
/* -------------------------------------------------------------------------- */
function SplitLayout() {
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1.05fr_1fr]">
      <HeroPanel />
      <section className="flex flex-1 items-center justify-center bg-bg px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <LoginCard />
        </div>
      </section>
    </main>
  )
}

/** 좌측(모바일은 상단) 브랜드 히어로 패널 */
function HeroPanel() {
  return (
    <section
      className="relative flex flex-col justify-center overflow-hidden px-6 py-10 text-white sm:px-10 lg:px-14 lg:py-16"
      style={{
        background:
          'linear-gradient(158deg, var(--bt-color-action) 0%, var(--bt-color-brand) 52%, #7DA3F2 100%)',
      }}
    >
      <img
        src={heroImg}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 hidden w-[380px] opacity-20 blur-[1px] lg:block"
      />
      <div className="relative z-10 max-w-[520px]">
        <BrandMark tone="light" />
        <span
          className="bt-caption mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold"
          style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}
        >
          낯선 사람과의 대화, 연습이 됩니다
        </span>
        <h1 className="mt-4 text-[28px] font-bold leading-[1.25] tracking-[-0.02em] sm:text-[34px] lg:text-[40px]">
          30분 모의 소개팅으로
          <br />
          대화 습관을 바꿔보세요
        </h1>
        <p className="mt-4 max-w-[440px] text-[15px] leading-[1.65] text-white/85">
          실제 소개팅 전에 연습하고, AI 코칭과 상대 피드백으로 내 대화의 강점과 개선점을 확인하세요.{' '}
          <b className="font-semibold text-white">연애 매칭이 아니라 대화 연습 서비스</b>입니다.
        </p>
        <HeroStats className="mt-8" />
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
  const setSession = useAuthStore((s) => s.setSession)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    // TODO(AUTH): apiClient.post('/auth/login', data) 로 교체
    console.log('login payload', data)
    setSession({ id: 'demo', nickname: '데모유저', isAdult: true }, 'demo-access-token')
    navigate('/')
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

            <Button type="submit" variant="primary" size="lg" block loading={isSubmitting}>
              로그인
            </Button>
          </Stack>
        </form>

        <p className="bt-body-sm bt-muted text-center">
          아직 계정이 없으신가요?{' '}
          <Link to="/signup" className="font-semibold text-link hover:underline">
            회원가입
          </Link>
        </p>
        <p className="bt-caption text-center">만 19세 이상만 가입할 수 있어요.</p>
      </Stack>
    </Card>
  )
}

/** Google · 네이버 소셜 로그인 (브랜드 색은 --_bg/--_fg 로 주입) */
function SocialButtons() {
  const google: BrandVars = {
    '--_bg': '#ffffff',
    '--_fg': '#1f1f1f',
    '--_bd': 'var(--bt-color-border-strong)',
  }
  const naver: BrandVars = { '--_bg': '#03C75A', '--_fg': '#ffffff', '--_bd': 'transparent' }

  return (
    <Stack gap={8}>
      <Button size="lg" block style={google} onClick={() => console.log('TODO(AUTH): Google OAuth')}>
        <GoogleGlyph />
        Google로 계속하기
      </Button>
      <Button size="lg" block style={naver} onClick={() => console.log('TODO(AUTH): Naver OAuth')}>
        <span className="grid h-[18px] w-[18px] place-items-center rounded-[3px] bg-white/25 text-[13px] font-black leading-none">
          N
        </span>
        네이버로 계속하기
      </Button>
    </Stack>
  )
}

/* -------------------------------------------------------------------------- */
/*  프리미티브                                                                 */
/* -------------------------------------------------------------------------- */
function BrandMark({ tone }: { tone: 'light' | 'dark' }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.02em]"
      style={{ color: tone === 'light' ? '#fff' : 'var(--bt-color-text)' }}
    >
      <span aria-hidden="true" className="text-[22px]">
        🌸
      </span>
      BloomTalk
    </span>
  )
}

function HeroStats({ className = '' }: { className?: string }) {
  const stats = [
    { v: '30분', k: '화상 세션' },
    { v: '실시간', k: 'AI 코칭' },
    { v: '상호', k: '행동 피드백' },
  ]
  return (
    <dl className={`flex gap-6 ${className}`}>
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
