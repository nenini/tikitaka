import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, CardButton, Field, Input, Stack, Steps } from '@/components'
import { cn } from '@/shared/lib/cn'

/* -------------------------------------------------------------------------- */
/*  W-04 · 기본 프로필 (FE-PROFILE-01) — 온보딩 4/5                              */
/*  1차 확정 옵션:                                                              */
/*   ① 성별 = 라디오 카드   ② 키(cm) = 제외   ③ 지역 = 시·도만                  */
/*   ④ 선호 연령 = W-06 설문에서   ⑤ 닉네임 중복확인 = 있음                      */
/*  - 상대 공개(닉네임·연령대·얼굴상) / 매칭 전용(시·도) 2분할                    */
/*  - 실명·전화·정확한 주소·직업 미노출·미수집(D-08)                             */
/* -------------------------------------------------------------------------- */

const STEP_LABELS = ['계정', '본인인증', '동의', '프로필', '설문'] as const

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

type NickStatus = 'idle' | 'checking' | 'available' | 'taken'

const GENDERS: { value: ProfileForm['gender']; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
]

/** 시·도 17개 (행정 표준). 구·군은 수집하지 않는다(정확한 지역 미노출). */
const SIDO = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
]

/** 데모용 닉네임 중복 확인 스텁. TODO(AUTH): GET /api/me/nickname/check 로 교체. */
async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 600))
  return nickname.trim() !== '유월'
}

export function ProfilePage() {
  const navigate = useNavigate()
  const [nickStatus, setNickStatus] = useState<NickStatus>('idle')

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nickname: '', gender: undefined as unknown as ProfileForm['gender'], regionSido: '' },
  })

  const nickname = watch('nickname')

  const nickReg = register('nickname', {
    onChange: () => nickStatus !== 'idle' && setNickStatus('idle'),
  })

  const onCheckNickname = async () => {
    const value = nickname?.trim()
    if (!value || value.length < 2) {
      setError('nickname', { message: '먼저 닉네임(2자 이상)을 입력하세요' })
      return
    }
    setNickStatus('checking')
    const ok = await checkNicknameAvailable(value)
    setNickStatus(ok ? 'available' : 'taken')
  }

  const onSubmit = async (data: ProfileForm) => {
    if (nickStatus !== 'available') {
      setError('nickname', { message: '닉네임 중복 확인을 해주세요' })
      return
    }
    // TODO(PROFILE): PUT /api/me/profile 로 교체
    console.log('profile payload', data)
    navigate('/signup/survey')
  }

  const nickError =
    errors.nickname?.message ?? (nickStatus === 'taken' ? '이미 사용 중인 닉네임이에요' : undefined)
  const nickHelp =
    nickStatus === 'available' ? '사용 가능한 닉네임이에요' : '상대에게 보이는 이름이에요 (2~12자)'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col justify-center gap-5 px-5 py-10">
      <header>
        <Steps count={5} current={4} labels={STEP_LABELS} />
        <h1 className="bt-h2 mt-4">기본 프로필</h1>
        <p className="bt-body-sm bt-muted mt-1">상대에게 보일 정보와 매칭에만 쓰는 정보를 나눠 받아요.</p>
      </header>

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
                  <div className="flex items-start gap-2">
                    <Input
                      className="flex-1"
                      placeholder="2~12자"
                      autoComplete="nickname"
                      maxLength={12}
                      {...nickReg}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onCheckNickname}
                      loading={nickStatus === 'checking'}
                      disabled={!nickname}
                    >
                      중복 확인
                    </Button>
                  </div>
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

      {/* 접근성: 닉네임 중복 확인 진행 상태 */}
      <span className="bt-sr-only" role="status" aria-live="polite">
        {nickStatus === 'checking'
          ? '닉네임 중복 확인 중'
          : nickStatus === 'available'
            ? '사용 가능한 닉네임입니다'
            : nickStatus === 'taken'
              ? '이미 사용 중인 닉네임입니다'
              : ''}
      </span>
    </main>
  )
}
