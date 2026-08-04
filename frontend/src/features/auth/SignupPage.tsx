import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, Field, Input, Progress, Stack, Steps } from '@/components'
import { serverMessageOf } from '@/shared/api/envelope'
import { ONBOARDING_STEP, ONBOARDING_STEP_COUNT, ONBOARDING_STEP_LABELS } from './onboardingSteps'
import { useAuthStore } from '@/stores/auth.store'
import { signup } from './api'

/* -------------------------------------------------------------------------- */
/*  W-02 · 계정 만들기 (AUTH-01) — 온보딩 1/5                                    */
/*  - 이메일(중복확인) · 비밀번호(강도)·확인                                     */
/*  - 실명·전화번호는 비공개(운영 목적) 수집 — 상대에게 공개되지 않는다.          */
/*  - 개인정보 동의는 별도 목적별 동의 화면(W-03)에서 받는다.                     */
/*  - 공통 컴포넌트 규약 준수: Steps / Field / Input / Progress / Badge / Callout */
/* -------------------------------------------------------------------------- */


/** 오늘(yyyy-MM-dd) — 생년월일 입력의 상한. */
const TODAY_ISO = new Date().toISOString().slice(0, 10)

/** ISO 날짜(yyyy-MM-dd)가 만 19세 이상인지. */
function isAtLeast19(iso: string): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const nineteenth = new Date(d.getFullYear() + 19, d.getMonth(), d.getDate())
  return nineteenth <= new Date()
}

const signupSchema = z
  .object({
    email: z.string().min(1, '이메일을 입력하세요').email('올바른 이메일 형식이 아니에요'),
    password: z
      .string()
      .min(8, '비밀번호는 8자 이상이어야 합니다')
      .regex(/[A-Za-z]/, '영문을 포함해주세요')
      .regex(/\d/, '숫자를 포함해주세요'),
    passwordConfirm: z.string().min(1, '비밀번호를 한 번 더 입력하세요'),
    realName: z.string().trim().min(2, '실명을 입력하세요'),
    phone: z
      .string()
      .trim()
      .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, '올바른 휴대폰 번호를 입력하세요'),
    birthDate: z
      .string()
      .min(1, '생년월일을 선택하세요')
      .refine((v) => !Number.isNaN(Date.parse(v)), '올바른 날짜를 입력하세요')
      .refine(isAtLeast19, '만 19세 이상만 가입할 수 있어요'),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ['passwordConfirm'],
    message: '비밀번호가 일치하지 않아요',
  })

type SignupForm = z.infer<typeof signupSchema>

type EmailStatus = 'idle' | 'checking' | 'available' | 'taken'

/** 데모용 이메일 중복 확인 스텁. TODO(AUTH): GET /api/auth/check-email 로 교체. */
async function checkEmailAvailable(email: string): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 650))
  return email.trim().toLowerCase() !== 'taken@example.com'
}

/** 비밀번호 강도 0~4 → 미터/라벨. */
function passwordScore(pw: string): number {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}
const STRENGTH = ['너무 짧아요', '약함', '보통', '강함', '아주 강함'] as const

export function SignupPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle')
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      passwordConfirm: '',
      realName: '',
      phone: '',
      birthDate: '',
    },
  })

  const email = watch('email')
  const password = watch('password')
  const score = passwordScore(password)

  const onCheckEmail = async () => {
    const value = email?.trim()
    if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError('email', { message: '먼저 올바른 이메일을 입력하세요' })
      return
    }
    setEmailStatus('checking')
    const ok = await checkEmailAvailable(value)
    setEmailStatus(ok ? 'available' : 'taken')
  }

  const onSubmit = async (data: SignupForm) => {
    if (emailStatus !== 'available') {
      setError('email', { message: '이메일 중복 확인을 해주세요' })
      return
    }
    setFormError(null)
    try {
      // 가입 → 토큰 발급(가입 즉시 로그인 상태). 이후 온보딩은 인증된 상태로 진행한다.
      const tokens = await signup({
        email: data.email,
        password: data.password,
        realName: data.realName,
        phoneNumber: data.phone,
        birthDate: data.birthDate,
      })
      await signIn(tokens) // 토큰 저장 + GET /v1/users/me 하이드레이션
      navigate('/signup/verify')
    } catch (error) {
      // 메시지 유무로 분기하므로 폴백을 받지 않는 serverMessageOf 를 쓴다
      const message = serverMessageOf(error)
      if (message && /이메일|email/i.test(message)) {
        setError('email', { message })
        setEmailStatus('taken')
      } else {
        setFormError(message ?? '가입에 실패했어요. 잠시 후 다시 시도해주세요.')
      }
    }
  }

  // 이메일이 바뀌면 중복확인 상태를 초기화한다(오래된 확인 결과 방지).
  const emailReg = register('email', {
    onChange: () => emailStatus !== 'idle' && setEmailStatus('idle'),
  })

  const emailHelp =
    emailStatus === 'available' ? '중복 확인 완료 · 로그인 ID로 사용돼요' : '로그인 ID로 사용돼요'
  const emailError =
    errors.email?.message ?? (emailStatus === 'taken' ? '이미 가입된 이메일이에요' : undefined)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-5 px-5 py-10">
      <header>
        <Steps
          count={ONBOARDING_STEP_COUNT}
          current={ONBOARDING_STEP.account}
          labels={ONBOARDING_STEP_LABELS}
        />
        <h1 className="bt-h2 mt-4">계정 만들기</h1>
        <p className="bt-body-sm bt-muted mt-1">이메일과 비밀번호로 시작해요. 4단계만 더 하면 끝나요.</p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={20}>
          <Card>
            <Stack gap={16}>
              <Field label="이메일" required error={emailError} help={emailError ? undefined : emailHelp}>
                <div className="flex items-start gap-2">
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    className="flex-1"
                    {...emailReg}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onCheckEmail}
                    loading={emailStatus === 'checking'}
                    disabled={!email}
                  >
                    중복 확인
                  </Button>
                </div>
              </Field>

              <Field
                label="비밀번호"
                required
                error={errors.password?.message}
                help={errors.password ? undefined : '영문·숫자 포함 8자 이상'}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="8자 이상"
                  {...register('password')}
                />
              </Field>

              {password.length > 0 && (
                <div className="-mt-2 flex items-center gap-2">
                  <Progress
                    className="flex-1"
                    value={(score / 4) * 100}
                    aria-label={`비밀번호 강도: ${STRENGTH[score]}`}
                  />
                  <span className="bt-caption" style={{ minWidth: 52, textAlign: 'right' }}>
                    {STRENGTH[score]}
                  </span>
                </div>
              )}

              <Field label="비밀번호 확인" required error={errors.passwordConfirm?.message}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="비밀번호를 한 번 더 입력"
                  {...register('passwordConfirm')}
                />
              </Field>

              <div className="h-px bg-[var(--bt-color-border)]" />

              {/* 비공개(운영 목적) — 상대에게 공개되지 않음 */}
              <div className="flex items-center gap-2">
                <Badge>비공개</Badge>
                <span className="bt-caption">
                  아래 정보는 <b className="text-ink">운영 목적으로만</b> 쓰이고 상대에게 공개되지 않아요.
                </span>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label="실명" required error={errors.realName?.message} className="flex-1">
                  <Input autoComplete="name" placeholder="홍길동" {...register('realName')} />
                </Field>
                <Field label="전화번호" required error={errors.phone?.message} className="flex-1">
                  <Input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="010-1234-5678"
                    {...register('phone')}
                  />
                </Field>
              </div>

              <Field
                label="생년월일"
                required
                error={errors.birthDate?.message}
                help={errors.birthDate ? undefined : '만 19세 이상만 가입할 수 있어요'}
              >
                <Input type="date" max={TODAY_ISO} autoComplete="bday" {...register('birthDate')} />
              </Field>
            </Stack>
          </Card>

          <Callout tone="info">
            개인정보 동의는 다음 단계에서 <b>목적별로 나눠</b> 받아요 — 필요한 항목만 선택할 수 있어요.
          </Callout>

          {formError && <Callout tone="danger">{formError}</Callout>}

          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} trailingAffordance>
            다음 · 본인인증
          </Button>
        </Stack>
      </form>

      {/* 접근성: 중복 확인 진행 상태를 스크린리더에 알린다 */}
      <span className="bt-sr-only" role="status" aria-live="polite">
        {emailStatus === 'checking'
          ? '이메일 중복 확인 중'
          : emailStatus === 'available'
            ? '사용 가능한 이메일입니다'
            : emailStatus === 'taken'
              ? '이미 가입된 이메일입니다'
              : ''}
      </span>
    </main>
  )
}
