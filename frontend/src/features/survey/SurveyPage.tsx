import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, CardHeader, Spinner, Stack, Steps } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { useAuthStore } from '@/stores/auth.store'
import { ONBOARDING_STEP, ONBOARDING_STEP_COUNT, ONBOARDING_STEP_LABELS } from '@/features/auth/onboardingSteps'
import { createMySurvey, getMySurvey, getSurveyOptions, updateMySurvey } from './api'
import { AgeRangeField, MultiChoice, SingleChoice } from './parts'
import {
  AGE_DEFAULT_MAX,
  AGE_DEFAULT_MIN,
  GOAL_MIN_COUNT,
  TRAIT_PICK_COUNT,
  type SurveyOptions,
  type SurveySavePayload,
} from './types'

/* -------------------------------------------------------------------------- */
/*  W-06 · 온보딩 설문 (SURVEY-01) — 온보딩 6/6                                 */
/*  W-19b · 설문 재응답 (mode="edit")                                          */
/*                                                                            */
/*  확정 계약(2026-08-04, CONTRACT_DECISIONS.md A9):                           */
/*    선호 얼굴상 1개 · 원하는 상대 성격 3개 · 본인 성격 3개 ·                  */
/*    선호 나이 최소~최대 · 개선 고민 1개 이상                                  */
/*                                                                            */
/*  서버가 정확한 개수를 요구하므로(@Size(min=3,max=3)) 개수를 채우기 전에는     */
/*  제출을 잠근다 — 사용자가 서버 검증 오류를 마주하지 않게 한다.               */
/*                                                                            */
/*  얼굴상 선택지는 서버가 프로필 성별로 이미 걸러서 준다. 프론트는 다시         */
/*  필터하지 않는다.                                                           */
/* -------------------------------------------------------------------------- */

export interface SurveyPageProps {
  /** 온보딩 최초 등록인지, 마이페이지에서 다시 응답하는지 */
  mode?: 'onboarding' | 'edit'
}

interface FormState {
  faceTagId: number | null
  preferredTraitIds: number[]
  userTraitIds: number[]
  minAge: number
  maxAge: number
  goalIds: number[]
}

const EMPTY_FORM: FormState = {
  faceTagId: null,
  preferredTraitIds: [],
  userTraitIds: [],
  minAge: AGE_DEFAULT_MIN,
  maxAge: AGE_DEFAULT_MAX,
  goalIds: [],
}

export function SurveyPage({ mode = 'onboarding' }: SurveyPageProps) {
  const navigate = useNavigate()
  const onboarding = mode === 'onboarding'

  const [options, setOptions] = useState<SurveyOptions | null>(null)
  /** 기존 응답 유무. 등록(POST)과 수정(PUT) 중 무엇을 부를지 가른다. */
  const [hasExisting, setHasExisting] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /**
   * 선택지와 기존 응답을 함께 읽는다.
   * 편집 모드가 아니어도 기존 응답을 확인한다 — 온보딩 도중 이탈했다가 돌아온
   * 사용자에게 빈 폼을 다시 채우게 하면 안 되고, POST 를 부르면 409 가 난다.
   */
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextOptions, existing] = await Promise.all([getSurveyOptions(), getMySurvey()])
      setOptions(nextOptions)
      setHasExisting(existing != null)
      if (existing) {
        /**
         * 얼굴상 선택지는 **프로필 성별에 따라 달라진다**(서버가 `ALL` + 상대 성별만 준다).
         * 프로필에서 성별을 바꾸면 전에 고른 얼굴상이 목록에서 사라지는데, 그 id 를 그대로
         * 들고 있으면 화면에는 아무것도 선택돼 보이지 않으면서 저장 버튼만 열려 있다가
         * 서버에서 `INVALID_SURVEY_OPTION` 으로 거절된다 — 사용자가 손쓸 수 없는 막다른 길이다.
         * 목록에 없으면 미선택으로 되돌려, 기존 안내("선호 얼굴상을 골라주세요")가 뜨고
         * 다시 고르기 전까지 저장이 잠기게 한다.
         */
        const faceTagStillOffered = nextOptions.faceTags.some(
          (tag) => tag.id === existing.preferredFaceTag.id,
        )
        setForm({
          faceTagId: faceTagStillOffered ? existing.preferredFaceTag.id : null,
          preferredTraitIds: existing.preferredTraits.map((t) => t.id),
          userTraitIds: existing.userTraits.map((t) => t.id),
          minAge: existing.minPreferredAge,
          maxAge: existing.maxPreferredAge,
          goalIds: existing.practiceGoals.map((g) => g.id),
        })
      }
    } catch (error) {
      // 편집 모드로 온 사용자는 프로필이 이미 있다 — 온보딩용 안내를 그대로 쓰면 틀린 말이 된다
      setLoadError(
        errorMessageOf(
          error,
          onboarding
            ? '설문 선택지를 불러오지 못했어요. 기본 프로필을 먼저 입력해 주세요.'
            : '설문을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [onboarding])

  useEffect(() => {
    void load()
  }, [load])

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }))

  const faceDone = form.faceTagId != null
  const preferredDone = form.preferredTraitIds.length === TRAIT_PICK_COUNT
  const userDone = form.userTraitIds.length === TRAIT_PICK_COUNT
  const goalDone = form.goalIds.length >= GOAL_MIN_COUNT
  const canSubmit = faceDone && preferredDone && userDone && goalDone

  async function handleSubmit() {
    if (!canSubmit || form.faceTagId == null || submitting) return
    setSubmitting(true)
    setSubmitError(null)

    const payload: SurveySavePayload = {
      preferredFaceTagId: form.faceTagId,
      preferredTraitIds: form.preferredTraitIds,
      userTraitIds: form.userTraitIds,
      minPreferredAge: form.minAge,
      maxPreferredAge: form.maxAge,
      practiceGoalIds: form.goalIds,
    }

    try {
      if (hasExisting) await updateMySurvey(payload)
      else await createMySurvey(payload)
      // 설문이 온보딩의 마지막 단계다 — 여기서 게이트를 연다.
      // 갱신하지 않으면 홈으로 이동하자마자 보호 라우트가 설문으로 되돌린다.
      useAuthStore.getState().setOnboarding('ready')
      navigate(onboarding ? '/' : '/me/edit', { replace: true })
    } catch (error) {
      setSubmitError(errorMessageOf(error, '설문을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="mx-auto grid w-full max-w-[720px] place-items-center px-5 py-20" aria-busy="true">
        <Spinner size={28} />
      </main>
    )
  }

  if (loadError || !options) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-5 py-10">
        <Stack gap={12}>
          <Callout tone="danger" icon="report">
            {loadError ?? '설문 선택지를 불러오지 못했어요.'}
          </Callout>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              다시 시도
            </Button>
            {/* 조회 실패 시에도 빠져나갈 곳을 준다 — 모드에 따라 되돌아갈 자리가 다르다 */}
            {onboarding ? (
              <Button variant="ghost" onClick={() => navigate('/signup/profile')}>
                프로필 입력으로
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => navigate('/me/edit')}>
                개인정보 관리로
              </Button>
            )}
          </div>
        </Stack>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-6">
      <header className="mb-5">
        {onboarding ? (
          <Steps
            count={ONBOARDING_STEP_COUNT}
            current={ONBOARDING_STEP.survey}
            labels={ONBOARDING_STEP_LABELS}
          />
        ) : (
          /* 온보딩은 되돌아갈 곳이 흐름상 정해져 있지만, 편집은 허브에서 들어온다.
             프로필·지역 편집 화면과 같은 자리에 같은 문구로 둔다. */
          <Button variant="ghost" size="sm" onClick={() => navigate('/me/edit')}>
            ‹ 개인정보 관리
          </Button>
        )}
        <h1 className="bt-h2 mt-4">{onboarding ? '이상형과 개선 목표' : '설문 다시 응답'}</h1>
        <p className="bt-body-sm bt-muted mt-1">
          매칭 조건과 코칭 방향을 정하는 데 써요. 마이페이지에서 언제든 바꿀 수 있어요.
        </p>
      </header>

      <Stack gap={16}>
        <Card>
          <CardHeader title="어떤 얼굴상을 선호하세요?" />
          <p className="bt-caption bt-muted mb-3">하나만 골라주세요.</p>
          <SingleChoice
            label="선호 얼굴상"
            options={options.faceTags}
            value={form.faceTagId}
            disabled={submitting}
            onChange={(id) => patch({ faceTagId: id })}
          />
        </Card>

        <Card>
          <CardHeader title="상대가 어떤 성격이면 좋을까요?" />
          <p className="bt-caption bt-muted mb-3">
            <span className="bt-numeric">{TRAIT_PICK_COUNT}</span>개를 골라주세요. (
            <span className="bt-numeric">{form.preferredTraitIds.length}</span> /{' '}
            <span className="bt-numeric">{TRAIT_PICK_COUNT}</span>)
          </p>
          <MultiChoice
            label="원하는 상대 성격"
            options={options.traits}
            value={form.preferredTraitIds}
            exactly={TRAIT_PICK_COUNT}
            disabled={submitting}
            onChange={(next) => patch({ preferredTraitIds: next })}
          />
        </Card>

        <Card>
          <CardHeader title="본인은 어떤 성격인가요?" />
          <p className="bt-caption bt-muted mb-3">
            <span className="bt-numeric">{TRAIT_PICK_COUNT}</span>개를 골라주세요. (
            <span className="bt-numeric">{form.userTraitIds.length}</span> /{' '}
            <span className="bt-numeric">{TRAIT_PICK_COUNT}</span>)
          </p>
          <MultiChoice
            label="본인 성격"
            options={options.traits}
            value={form.userTraitIds}
            exactly={TRAIT_PICK_COUNT}
            disabled={submitting}
            onChange={(next) => patch({ userTraitIds: next })}
          />
        </Card>

        <Card>
          <CardHeader title="선호하는 나이대" />
          <div className="mt-3">
            <AgeRangeField
              min={form.minAge}
              max={form.maxAge}
              disabled={submitting}
              onChange={({ min, max }) => patch({ minAge: min, maxAge: max })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="대화에서 고치고 싶은 점" />
          <p className="bt-caption bt-muted mb-3">
            하나 이상 골라주세요. 코칭이 이 부분을 먼저 봐요.
          </p>
          <MultiChoice
            label="개선 고민"
            options={options.practiceGoals}
            value={form.goalIds}
            disabled={submitting}
            onChange={(next) => patch({ goalIds: next })}
          />
        </Card>

        {submitError && (
          <span className="bt-error" role="alert">
            {submitError}
          </span>
        )}

        <Stack gap={8}>
          <Button
            variant="primary"
            size="lg"
            block
            loading={submitting}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {onboarding ? '시작하기' : '저장'}
          </Button>
          {!canSubmit && (
            <p className="bt-caption bt-muted" role="status" aria-live="polite">
              {!faceDone && '선호 얼굴상을 골라주세요. '}
              {!preferredDone && `원하는 상대 성격을 ${TRAIT_PICK_COUNT}개 채워주세요. `}
              {!userDone && `본인 성격을 ${TRAIT_PICK_COUNT}개 채워주세요. `}
              {!goalDone && '고치고 싶은 점을 하나 이상 골라주세요.'}
            </p>
          )}
        </Stack>
      </Stack>
    </main>
  )
}

/** 마이페이지 → 개인정보 관리에서 설문만 다시 응답하는 진입점(W-19b). */
export function SurveyEditPage() {
  return <SurveyPage mode="edit" />
}
