import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, Field, Input, Progress, Stack } from '@/components'
import { errorCodeOf, serverMessageOf } from '@/shared/api/envelope'
import { ONBOARDING_STEP } from './onboardingSteps'
import { useAuthStore } from '@/stores/auth.store'
import { signup } from './api'
import { OnboardingShell } from './OnboardingShell'

/* -------------------------------------------------------------------------- */
/*  W-02 · 계정 만들기 (AUTH-01) — 온보딩 1/5                                    */
/*  - 이메일 · 비밀번호(강도)·확인                                              */
/*  - 실명·전화번호는 비공개(운영 목적) 수집 — 상대에게 공개되지 않는다.          */
/*  - 개인정보 동의는 별도 목적별 동의 화면(W-03)에서 받는다.                     */
/*  - 공통 컴포넌트 규약 준수: Steps / Field / Input / Progress / Badge / Callout */
/*                                                                            */
/*  ⚠️ 이메일 중복 확인 버튼을 두지 않는다. 확인용 API 가 없어서 예전에는 화면에서   */
/*     'taken@example.com' 하나만 걸러내는 스텁을 돌렸는데, 어떤 주소든 "사용     */
/*     가능" 이라고 해놓고 가입할 때 서버가 `DUPLICATE_EMAIL` 을 돌려줬다.       */
/*     확인할 수 없는 것을 확인해 준 것처럼 보이는 편이 확인 버튼이 없는 것보다    */
/*     나쁘다. 지금은 가입 시점의 서버 판정 하나만 쓴다 — 온보딩 프로필 화면      */
/*     (`ProfilePage`)의 닉네임과 같은 방식이다.                                */
/*     TODO(AUTH): 중복 확인 API 가 생기면 두 화면에 함께 붙인다.                 */
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
    /**
     * 서버 정책(`PasswordPolicy.REGEXP`)과 **같은 규칙**이어야 한다.
     * 예전에는 영문·숫자만 검사해서, 특수문자 없는 비밀번호가 프론트 검증을 통과한 뒤
     * 서버에서 거부됐다. 정책 정본은 백엔드다.
     */
    password: z
      .string()
      .min(8, '비밀번호는 8자 이상이어야 합니다')
      .max(64, '비밀번호는 64자 이하여야 합니다')
      .regex(/[A-Za-z]/, '영문을 포함해주세요')
      .regex(/\d/, '숫자를 포함해주세요')
      .regex(/[^A-Za-z\d\s]/, '특수문자를 포함해주세요')
      .regex(/^\S*$/, '공백은 쓸 수 없어요'),
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

/** 비밀번호 강도 0~4 → 미터/라벨. */
/**
 * 강도 표시용 점수(0~4).
 * 서버 정책의 필수 조건(길이·영문·숫자·특수문자)을 앞쪽 3점에 두어,
 * **3점 미만이면 어차피 서버가 거부**한다는 사실이 막대에 드러나게 한다.
 * 4점은 대소문자 혼용까지 한 경우의 가산점이다.
 */
function passwordScore(pw: string): number {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8 && pw.length <= 64) s++
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++
  if (/[^A-Za-z\d\s]/.test(pw)) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  return s
}
const STRENGTH = ['너무 짧아요', '약함', '보통', '강함', '아주 강함'] as const

export function SignupPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setFocus,
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

  const password = watch('password')
  const score = passwordScore(password)

  const onSubmit = async (data: SignupForm) => {
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
      // 이메일 중복은 **이메일 필드**에 붙인다. 화면 아래 공용 오류로 띄우면 어느 칸을
      // 고쳐야 하는지 알 수 없어, 사용자가 비밀번호·생년월일을 의심하며 헤맨다.
      //
      // 문구가 아니라 **에러 코드**로 판정한다. 예전에는 서버 메시지에 '이메일' 이
      // 들어 있는지 정규식으로 봤는데, 서버가 문구를 다듬으면 조용히 어긋난다.
      if (errorCodeOf(error) === 'DUPLICATE_EMAIL') {
        setError('email', {
          message: serverMessageOf(error) ?? '이미 가입된 이메일이에요. 로그인하거나 다른 주소를 써주세요.',
        })
        setFocus('email')
        return
      }
      // 메시지 유무로 분기하므로 폴백을 받지 않는 serverMessageOf 를 쓴다
      setFormError(serverMessageOf(error) ?? '가입에 실패했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  const emailHelp = '로그인 ID로 사용돼요'
  const emailError = errors.email?.message

  return (
    <OnboardingShell
      current={ONBOARDING_STEP.account}
      title="계정 만들기"
      description="이메일과 비밀번호로 시작해요. 필요한 정보만 차근차근 확인할게요."
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={20}>
          <Card>
            <Stack gap={16}>
              <Field label="이메일" required error={emailError} help={emailError ? undefined : emailHelp}>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  {...register('email')}
                />
              </Field>

              <Field
                label="비밀번호"
                required
                error={errors.password?.message}
                help={errors.password ? undefined : '영문·숫자·특수문자 포함 8자 이상'}
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
    </OnboardingShell>
  )
}
