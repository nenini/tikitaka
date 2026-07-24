import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Callout,
  Card,
  ConsentRow,
  Field,
  Input,
  ListRowButton,
  Modal,
  Progress,
  Spinner,
  Steps,
  Stack,
} from '@/components'

/* -------------------------------------------------------------------------- */
/*  W-02 · 계정 만들기 (AUTH-01 · AUTH-03) — 온보딩 1/4                          */
/*  - 이메일(중복확인) · 비밀번호(강도)·확인 · 단일 필수 동의                     */
/*  - 공통 컴포넌트 규약 준수: Steps/Field/Input/ConsentRow/Modal/Callout        */
/*  - 실명·전화 미수집. 본인확인(KYC)은 다음 단계(W-02b).                        */
/* -------------------------------------------------------------------------- */

const signupSchema = z
  .object({
    email: z.string().min(1, '이메일을 입력하세요').email('올바른 이메일 형식이 아니에요'),
    password: z
      .string()
      .min(8, '비밀번호는 8자 이상이어야 합니다')
      .regex(/[A-Za-z]/, '영문을 포함해주세요')
      .regex(/\d/, '숫자를 포함해주세요'),
    passwordConfirm: z.string().min(1, '비밀번호를 한 번 더 입력하세요'),
    agree: z.literal(true, { message: '필수 항목에 동의해야 계속할 수 있어요' }),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ['passwordConfirm'],
    message: '비밀번호가 일치하지 않아요',
  })

type SignupForm = z.infer<typeof signupSchema>

type EmailStatus = 'idle' | 'checking' | 'available' | 'taken'
type DocKey = 'terms' | 'analysis' | 'report'

const STEP_LABELS = ['계정', '본인인증', '프로필', '설문'] as const

/** 약관 상세(보기). 처리 기준(수집 목적·보관)을 그대로 노출한다(디자인 원칙 §7.2). */
const DOCS: Record<DocKey, { title: string; body: string }> = {
  terms: {
    title: '이용약관 및 개인정보 처리방침',
    body: '서비스 이용약관과 개인정보 수집·이용에 대한 안내입니다. 수집 항목은 이메일과 온보딩에서 입력한 프로필 정보로 한정하며, 실명·전화번호·상세 주소는 수집하지 않습니다. 보관 기간과 파기 절차는 개인정보 처리방침 전문을 따릅니다.',
  },
  analysis: {
    title: '세션 중 표정·시선·음성 분석',
    body: '화상 세션 동안 대화 코칭을 위해 표정·시선·음성을 실시간 분석합니다. 분석은 코칭 지표 산출에만 사용되고, 원본 영상·음성은 세션 종료 즉시 삭제됩니다. 분석 결과(행동 지표)만 리포트에 저장됩니다.',
  },
  report: {
    title: '누적 성장 리포트 저장',
    body: '세션마다 생성되는 행동 기반 리포트를 계정에 누적 저장해 성장 추이를 보여줍니다. 외모·매력 점수는 저장하지 않으며, 저장된 리포트는 마이페이지에서 언제든 삭제를 요청할 수 있습니다.',
  },
}

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
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle')
  const [openDoc, setOpenDoc] = useState<DocKey | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', passwordConfirm: '', agree: false as unknown as true },
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
    // TODO(AUTH): apiClient.post('/api/auth/signup', { email, password }) 로 교체
    console.log('signup payload', { email: data.email })
    navigate('/signup/verify')
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
        <Steps count={4} current={1} labels={STEP_LABELS} />
        <h1 className="bt-h2 mt-4">계정 만들기</h1>
        <p className="bt-body-sm bt-muted mt-1">이메일과 비밀번호로 시작해요. 3단계만 더 하면 끝나요.</p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={20}>
          {/* ── 계정 정보 ─────────────────────────────── */}
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
            </Stack>
          </Card>

          {/* ── 단일 필수 동의 + 약관 보기 ────────────────── */}
          <Card>
            <Stack gap={12}>
              <Controller
                control={control}
                name="agree"
                render={({ field }) => (
                  <ConsentRow
                    required
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    title="약관 및 개인정보 처리에 모두 동의합니다"
                    desc="이용약관 · 개인정보 수집·이용 · 세션 중 표정·음성 분석 · 리포트 저장을 한 번에 동의해요."
                  />
                )}
              />
              {errors.agree && <span className="bt-error" role="alert">{errors.agree.message}</span>}

              <div className="h-px bg-[var(--bt-color-border)]" />

              <Stack gap={4} aria-label="동의 항목 자세히 보기">
                <ListRowButton
                  title="이용약관 및 개인정보 처리방침"
                  trailing={<span className="bt-caption text-link">보기 ›</span>}
                  onClick={() => setOpenDoc('terms')}
                />
                <ListRowButton
                  title="세션 중 표정·시선·음성 분석"
                  trailing={<span className="bt-caption text-link">보기 ›</span>}
                  onClick={() => setOpenDoc('analysis')}
                />
                <ListRowButton
                  title="누적 성장 리포트 저장"
                  trailing={<span className="bt-caption text-link">보기 ›</span>}
                  onClick={() => setOpenDoc('report')}
                />
              </Stack>
            </Stack>
          </Card>

          <Callout tone="info">
            실명·전화번호는 <b>수집하지 않아요.</b> 본인 확인은 다음 단계에서 KYC 인증으로 진행합니다.
          </Callout>

          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} trailingAffordance>
            다음 · 본인인증
          </Button>
        </Stack>
      </form>

      <Modal
        open={openDoc !== null}
        onClose={() => setOpenDoc(null)}
        title={openDoc ? DOCS[openDoc].title : ''}
        showClose
        actions={
          <Button variant="primary" onClick={() => setOpenDoc(null)}>
            확인
          </Button>
        }
      >
        {openDoc && <p className="bt-body-sm">{DOCS[openDoc].body}</p>}
      </Modal>

      {/* 접근성: 중복 확인 진행 상태를 스크린리더에 알린다 */}
      <span className="bt-sr-only" role="status" aria-live="polite">
        {emailStatus === 'checking' ? (
          <>
            <Spinner /> 이메일 중복 확인 중
          </>
        ) : emailStatus === 'available' ? (
          '사용 가능한 이메일입니다'
        ) : emailStatus === 'taken' ? (
          '이미 가입된 이메일입니다'
        ) : (
          ''
        )}
      </span>
    </main>
  )
}
