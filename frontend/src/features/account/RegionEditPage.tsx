import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, CardHeader, Field, Select, Spinner, Stack } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getMyProfile, updateProfile } from '@/features/profile/api'
import { SIDO } from '@/features/profile/regions'

/* -------------------------------------------------------------------------- */
/*  W-19b · 지역(시·도) 수정 (PROFILE-01)                                      */
/*                                                                            */
/*  기본 프로필과 같은 PATCH /v1/users/me/profile 을 쓰되 `regionCity` 만 보낸다. */
/*  변경이 없으면 서버가 `INVALID_INPUT` 으로 거절하므로 호출하지 않는다.        */
/*                                                                            */
/*  ⚠️ 서버에 저장된 값이 목록(SIDO)에 없을 수 있다 — `regionCity` 는 자유       */
/*     문자열(≤50자)이라 시드·구버전 데이터가 다른 표기를 쓸 수 있다.            */
/*     그 값을 조용히 버리면 사용자는 자기 지역이 지워진 것처럼 보게 되므로,      */
/*     현재값을 목록에 임시로 얹어 선택된 상태를 유지한다.                       */
/* -------------------------------------------------------------------------- */

export function RegionEditPage() {
  const navigate = useNavigate()

  const [initial, setInitial] = useState<string | null>(null)
  const [region, setRegion] = useState('')

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const profile = await getMyProfile()
      setInitial(profile.regionCity)
      setRegion(profile.regionCity)
    } catch (error) {
      setLoadError(errorMessageOf(error, '지역 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'))
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

  if (loadError || initial == null) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-10">
        <Stack gap={12}>
          <Callout tone="danger" icon="report">
            {loadError ?? '지역 정보를 불러오지 못했어요.'}
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

  // 저장된 값이 표준 목록 밖이면 맨 앞에 얹어 선택 상태를 잃지 않게 한다
  const choices: string[] = SIDO.includes(initial as (typeof SIDO)[number])
    ? [...SIDO]
    : [initial, ...SIDO].filter((value) => value.length > 0)

  const changed = region !== initial
  const canSubmit = changed && region.length > 0 && !submitting

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      await updateProfile({ regionCity: region })
      navigate('/me/edit', { replace: true })
    } catch (error) {
      setSubmitError(errorMessageOf(error, '지역을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'))
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
        <h1 className="bt-h2">지역 수정</h1>
      </div>
      <p className="bt-body-sm bt-muted mb-4">
        챗봇의 대화 주제·장소 추천에만 쓰여요. 상대에게 공개되지 않습니다.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <Stack gap={16}>
          <Card>
            <CardHeader title="매칭 전용 정보" />
            <Field label="시·도" required help="구·군 등 정확한 지역은 받지 않아요">
              <Select
                value={region}
                placeholder="시·도 선택"
                onChange={(e) => setRegion(e.target.value)}
                options={choices.map((value) => ({ value, label: value }))}
              />
            </Field>
          </Card>

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

          {!changed && <p className="bt-caption bt-muted">바꾼 내용이 있어야 저장할 수 있어요.</p>}
        </Stack>
      </form>
    </main>
  )
}
