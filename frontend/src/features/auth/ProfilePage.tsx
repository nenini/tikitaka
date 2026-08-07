import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, CardButton, Field, Input, Stack } from '@/components'
import { cn } from '@/shared/lib/cn'
import { createProfile } from '@/features/profile/api'
import { SIDO } from '@/features/profile/regions'
import { errorCodeOf, errorMessageOf, serverMessageOf } from '@/shared/api/envelope'
import { useAuthStore } from '@/stores/auth.store'
import { ONBOARDING_STEP } from './onboardingSteps'
import { OnboardingShell } from './OnboardingShell'

/* -------------------------------------------------------------------------- */
/*  W-04 · 기본 프로필 (FE-PROFILE-01) — 온보딩 4/5                              */
/*  1차 확정 옵션:                                                              */
/*   ① 성별 = 라디오 카드   ② 키(cm) = 제외   ③ 지역 = 시·도만                  */
/*   ④ 선호 연령 = W-06 설문에서                                                */
/*  - 상대 공개(닉네임·연령대·얼굴상) / 매칭 전용(시·도) 2분할                    */
/*  - 실명·전화·정확한 주소·직업 미노출·미수집(D-08)                             */
/*                                                                            */
/*  ⚠️ 닉네임 중복 확인 버튼을 두지 않는다. 확인용 API 가 없어서 예전에는 화면에서   */
/*     문자열만 비교하는 스텁을 돌렸는데, "사용 가능" 이라고 해놓고 저장할 때      */
/*     서버가 `DUPLICATE_NICKNAME` 을 돌려주는 일이 생겼다. 확인할 수 없는 것을    */
/*     확인해 준 것처럼 보이는 편이 확인 버튼이 없는 것보다 나쁘다.                */
/*     지금은 저장 시점의 서버 판정 하나만 쓴다 — 프로필 수정 화면              */
/*     (`account/ProfileEditPage`)과 같은 방식이다.                             */
/*     TODO(AUTH): 중복 확인 API 가 생기면 두 화면에 함께 붙인다.                 */
/* -------------------------------------------------------------------------- */


const profileSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, '닉네임은 2자 이상이어야 해요')
    .max(12, '닉네임은 12자 이하로 입력하세요'),
  gender: z.enum(['female', 'male'], { message: '성별을 선택하세요' }),
  regionSido: z.string().min(1, '시·도를 선택하세요'),
})
type ProfileForm = z.infer<typeof profileSchema>


const GENDERS: { value: ProfileForm['gender']; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
]

export function ProfilePage() {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nickname: '', gender: undefined as unknown as ProfileForm['gender'], regionSido: '' },
  })

  const onSubmit = async (data: ProfileForm) => {
    setSubmitError(null)
    try {
      // POST /api/v1/users/me/profile — 온보딩 4단계 프로필 생성
      await createProfile({
        nickname: data.nickname.trim(),
        gender: data.gender === 'female' ? 'FEMALE' : 'MALE', // 폼(소문자) → 백엔드 enum(대문자)
        regionCity: data.regionSido,
      })
      // 게이트를 다음 단계로 넘긴다(ProtectedRoute 가 이 값을 본다).
      // 갱신하지 않으면 보호 라우트가 여전히 프로필 단계로 튕겨낸다.
      // 아직 'ready' 가 아니다 — 설문이 남아 있다.
      useAuthStore.getState().setOnboarding('needs-survey')
      navigate('/signup/face')
    } catch (e) {
      // 닉네임 중복은 **닉네임 필드**에 붙인다. 화면 아래 공용 오류로 띄우면 어느 칸을
      // 고쳐야 하는지 알 수 없어, 사용자가 성별·지역을 의심하며 헤맨다.
      if (errorCodeOf(e) === 'DUPLICATE_NICKNAME') {
        setError('nickname', {
          message: serverMessageOf(e) ?? '이미 사용 중인 닉네임이에요. 다른 이름으로 바꿔주세요.',
        })
        setFocus('nickname')
        return
      }
      setSubmitError(errorMessageOf(e, '프로필 저장에 실패했어요. 잠시 후 다시 시도해주세요.'))
    }
  }

  const nickError = errors.nickname?.message
  const nickHelp = '상대에게 보이는 이름이에요 (2~12자)'

  return (
    <OnboardingShell
      current={ONBOARDING_STEP.profile}
      title="기본 프로필"
      description="상대에게 보일 정보와 매칭에만 쓰는 정보를 분명하게 나눠 받을게요."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={20}>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* ── 상대 공개 ─────────────────────────── */}
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Badge tone="success">상대 공개</Badge>
                <span className="bt-caption">소개팅에서 상대에게 보여요</span>
              </div>

              <Stack gap={16}>
                <Field label="닉네임" required error={nickError} help={nickError ? undefined : nickHelp}>
                  <Input
                    placeholder="2~12자"
                    autoComplete="nickname"
                    maxLength={12}
                    {...register('nickname')}
                  />
                </Field>

                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    <Field label="성별" required error={errors.gender?.message}>
                      <div className="flex gap-2" role="radiogroup" aria-label="성별">
                        {GENDERS.map((g) => {
                          const selected = field.value === g.value
                          return (
                            <CardButton
                              key={g.value}
                              role="radio"
                              aria-checked={selected}
                              onClick={() => field.onChange(g.value)}
                              className={cn('flex flex-1 items-center gap-2.5')}
                              style={
                                selected ? { boxShadow: '0 0 0 2px var(--bt-color-action)' } : undefined
                              }
                            >
                              <span
                                aria-hidden="true"
                                className="grid size-[18px] shrink-0 place-items-center rounded-full border-2"
                                style={{
                                  borderColor: selected
                                    ? 'var(--bt-color-action)'
                                    : 'var(--bt-color-border-strong)',
                                }}
                              >
                                {selected && (
                                  <span
                                    className="size-2.5 rounded-full"
                                    style={{ background: 'var(--bt-color-action)' }}
                                  />
                                )}
                              </span>
                              <b className="bt-body-sm">{g.label}</b>
                            </CardButton>
                          )
                        })}
                      </div>
                    </Field>
                  )}
                />
              </Stack>

              <p className="bt-caption mt-3">
                공개 항목: <b className="text-ink">닉네임 · 연령대 · 얼굴상</b>
              </p>
            </Card>

            {/* ── 매칭 전용 ─────────────────────────── */}
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Badge>매칭 전용</Badge>
                <span className="bt-caption">매칭 계산에만 쓰이고 노출되지 않아요</span>
              </div>

              <Field
                label="시·도"
                required
                error={errors.regionSido?.message}
                help={errors.regionSido ? undefined : '구·군 등 정확한 지역은 받지 않아요'}
              >
                <select className="bt-input" defaultValue="" {...register('regionSido')}>
                  <option value="" disabled>
                    시·도 선택
                  </option>
                  {SIDO.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Callout tone="info" className="mt-4">
                <span>
                  <b>선호 연령 범위</b>는 다음 설문(W-06)에서 '원하는 상대' 조건과 함께 받아요.
                </span>
              </Callout>
            </Card>
          </div>

          <Callout tone="warning" icon="info-circle">
            <b>키·직업·실명·전화·정확한 주소는 수집하지 않아요.</b> 매칭은 <b>시간 · 나이 · 외모 · 성격</b> 4요소로 계산됩니다(직업 제외 · D-08).
          </Callout>

          {submitError && (
            <Callout tone="warning" icon="info-circle">
              {submitError}
            </Callout>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              leadingIcon="chevron-left"
              onClick={() => navigate('/signup/consent')}
            >
              이전
            </Button>
            <Button type="submit" variant="primary" size="lg" className="flex-1" loading={isSubmitting} trailingAffordance>
              다음 · 얼굴 촬영
            </Button>
          </div>
        </Stack>
      </form>
    </OnboardingShell>
  )
}
