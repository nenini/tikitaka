import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Callout,
  Card,
  CardHeader,
  Field,
  Input,
  Segmented,
  Spinner,
  Stack,
} from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getMyProfile, updateProfile } from '@/features/profile/api'
import type { Gender, ProfileUpdatePayload } from '@/features/profile/types'

/* -------------------------------------------------------------------------- */
/*  W-19b · 기본 프로필 수정 (PROFILE-01)                                      */
/*                                                                            */
/*  GET  /v1/users/me/profile  으로 현재값을 채우고                             */
/*  PATCH /v1/users/me/profile 로 **바뀐 필드만** 보낸다.                       */
/*                                                                            */
/*  ⚠️ 서버는 세 필드가 모두 null 이면 `INVALID_INPUT` 으로 거절한다             */
/*     (`ProfileUpdateRequest.hasNoChanges()`). 그래서 변경이 없으면 아예        */
/*     호출하지 않고 저장 버튼을 잠근다.                                        */
/*                                                                            */
/*  ⚠️ 지역(시·도)은 여기서 다루지 않는다 — 별도 화면(/me/edit/region).          */
/*     같은 PATCH 를 쓰지만 화면을 나눈 건 허브의 2단 카드 구성을 따른 것이다.    */
/*                                                                            */
/*  ⚠️ 닉네임 중복 확인 버튼을 두지 않았다. 확인용 API 가 없고(온보딩 화면의       */
/*     `checkNicknameAvailable` 은 데모 스텁이다), 서버가 저장 시점에            */
/*     `DUPLICATE_NICKNAME` 으로 알려주므로 그 메시지를 그대로 보여준다.          */
/*     TODO(AUTH): 중복 확인 API 가 생기면 온보딩 화면과 함께 붙인다.            */
/* -------------------------------------------------------------------------- */

/** 화면 규칙. 서버는 2~30자를 허용하지만 온보딩(W-04)과 같은 상한을 쓴다. */
const NICKNAME_MIN = 2
const NICKNAME_MAX = 12

const GENDERS: readonly { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: '여성' },
  { value: 'MALE', label: '남성' },
]

interface FormState {
  nickname: string
  gender: Gender
}

export function ProfileEditPage() {
  const navigate = useNavigate()

  /** 서버에서 읽은 원본. 무엇이 바뀌었는지 판단하는 기준이다. */
  const [initial, setInitial] = useState<FormState | null>(null)
  const [form, setForm] = useState<FormState | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const profile = await getMyProfile()
      const next: FormState = { nickname: profile.nickname, gender: profile.gender }
      setInitial(next)
      setForm(next)
    } catch (error) {
      setLoadError(errorMessageOf(error, '프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <main className="mx-auto grid w-full max-w-[560px] place-items-center px-5 py-20" aria-busy="true">
        <Spinner size={28} />
      </main>
    )
  }

  if (loadError || !form || !initial) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-10">
        <Stack gap={12}>
          <Callout tone="danger" icon="report">
            {loadError ?? '프로필을 불러오지 못했어요.'}
          </Callout>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              다시 시도
            </Button>
            <Button variant="ghost" onClick={() => navigate('/me/edit')}>
              개인정보 관리로
            </Button>
          </div>
        </Stack>
      </main>
    )
  }

  const nickname = form.nickname.trim()
  const nicknameError =
    nickname.length === 0
      ? '닉네임을 입력하세요'
      : nickname.length < NICKNAME_MIN
        ? `닉네임은 ${NICKNAME_MIN}자 이상이어야 해요`
        : undefined

  const nicknameChanged = nickname !== initial.nickname
  const genderChanged = form.gender !== initial.gender
  const changed = nicknameChanged || genderChanged
  const canSubmit = changed && !nicknameError && !submitting

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || !initial) return

    // 바뀐 것만 담는다 — 서버는 보낸 필드만 반영한다(PATCH 의미론).
    const payload: ProfileUpdatePayload = {}
    if (nicknameChanged) payload.nickname = nickname
    if (genderChanged) payload.gender = form?.gender

    setSubmitting(true)
    setSubmitError(null)
    try {
      await updateProfile(payload)
      navigate('/me/edit', { replace: true })
    } catch (error) {
      // 닉네임 중복(DUPLICATE_NICKNAME)이 여기로 온다 — 서버 문구를 그대로 보여준다
      setSubmitError(errorMessageOf(error, '프로필을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-[560px] px-5 py-6">
      <div className="mb-1 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/me/edit')}>
          ‹ 개인정보 관리
        </Button>
        <h1 className="bt-h2">기본 프로필 수정</h1>
      </div>
      <p className="bt-body-sm bt-muted mb-4">닉네임과 성별은 소개팅에서 상대에게 보여요.</p>

      <form onSubmit={handleSubmit} noValidate>
        <Stack gap={16}>
          <Card>
            <CardHeader title="상대에게 보이는 정보" />
            <Stack gap={16}>
              <Field
                label="닉네임"
                required
                error={nicknameError}
                help={nicknameError ? undefined : `${NICKNAME_MIN}~${NICKNAME_MAX}자`}
              >
                <Input
                  value={form.nickname}
                  maxLength={NICKNAME_MAX}
                  autoComplete="nickname"
                  onChange={(e) =>
                    setForm((prev) => (prev ? { ...prev, nickname: e.target.value } : prev))
                  }
                />
              </Field>

              <Field label="성별" required>
                <Segmented
                  aria-label="성별"
                  options={GENDERS}
                  value={form.gender}
                  onChange={(gender) => setForm((prev) => (prev ? { ...prev, gender } : prev))}
                />
              </Field>
            </Stack>
          </Card>

          <Callout tone="info">
            선호 연령은 <b>설문</b>에서, 지역(시·도)은 <b>지역 수정</b>에서 바꿀 수 있어요.
          </Callout>

          {submitError && (
            <Callout tone="danger" icon="report">
              {submitError}
            </Callout>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => navigate('/me/edit')}>
              취소
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1"
              loading={submitting}
              disabled={!canSubmit}
            >
              저장
            </Button>
          </div>

          {/* 변경 전에는 저장이 잠기는 이유를 알려준다 — 눌리지 않는 버튼만 두면 고장으로 보인다 */}
          {!changed && <p className="bt-caption bt-muted">바꾼 내용이 있어야 저장할 수 있어요.</p>}
        </Stack>
      </form>
    </main>
  )
}
