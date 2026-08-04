import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, ConsentRow, Spinner, Stack, Steps } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getActiveConsentTypes, saveMyConsents } from '@/features/consent/api'
import { CONSENT_DESCRIPTION, isRequiredConsent, type ConsentType } from '@/features/consent/types'
import { ONBOARDING_STEP, ONBOARDING_STEP_COUNT, ONBOARDING_STEP_LABELS } from './onboardingSteps'

/* -------------------------------------------------------------------------- */
/*  W-03 · 목적별 개인정보 동의 (AUTH-03) — 온보딩 3/6                          */
/*                                                                            */
/*  확정 계약(2026-08-04, CONTRACT_DECISIONS.md A8):                           */
/*   - 가입 동의는 **통합(필수) + 얼굴(선택)** 2종. 서버 시드가 정본이라         */
/*     항목을 프론트에 하드코딩하지 않고 GET /consents 로 받아 그린다.          */
/*   - 표정·음성 분석은 동의가 아니라 세션 설정에서 다룬다                       */
/*     (PATCH /sessions/{id}/analysis-settings) — 예전엔 여기서 한 번 더        */
/*     받아서 같은 상태가 두 곳에 생겼다.                                       */
/*   - 누적 리포트 저장은 통합 동의에 포함되며 별도 항목을 두지 않는다.          */
/*                                                                            */
/*  유지되는 UI 원칙:                                                          */
/*   ① 선택 항목 기본값 = opt-in(모두 off)                                      */
/*   ② 필수 항목 = 잠금형(항상 on·비활성) — 서비스 이용의 전제 조건             */
/*   ③ 레이아웃 = 통합 리스트(1카드)                                            */
/* -------------------------------------------------------------------------- */

export function ConsentPage() {
  const navigate = useNavigate()

  const [types, setTypes] = useState<ConsentType[] | null>(null)
  const [granted, setGranted] = useState<Record<number, boolean>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    getActiveConsentTypes()
      .then((list) => {
        if (!alive) return
        setTypes(list)
        // 필수는 잠금이라 처음부터 동의, 선택은 opt-in 이라 꺼진 상태로 시작한다
        setGranted(
          Object.fromEntries(list.map((t) => [t.consentTypeId, isRequiredConsent(t.code)])),
        )
      })
      .catch((error) => {
        if (alive) setLoadError(errorMessageOf(error, '동의 항목을 불러오지 못했어요.'))
      })
    return () => {
      alive = false
    }
  }, [])

  async function onContinue() {
    if (!types || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // 선택하지 않은 항목도 `consented: false` 로 함께 보낸다 —
      // 거부했다는 사실도 기록으로 남겨야 나중에 "물어본 적 없음" 과 구분된다.
      await saveMyConsents({
        consents: types.map((t) => ({
          consentTypeId: t.consentTypeId,
          consented: granted[t.consentTypeId] ?? isRequiredConsent(t.code),
        })),
      })
      navigate('/signup/profile')
    } catch (error) {
      setSubmitError(errorMessageOf(error, '동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setSubmitting(false)
    }
  }

  const optional = types?.filter((t) => !isRequiredConsent(t.code)) ?? []
  const required = types?.filter((t) => isRequiredConsent(t.code)) ?? []

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-5 px-5 py-10">
      <header>
        <Steps
          count={ONBOARDING_STEP_COUNT}
          current={ONBOARDING_STEP.consent}
          labels={ONBOARDING_STEP_LABELS}
        />
        <h1 className="bt-h2 mt-4">목적별 개인정보 동의</h1>
        <p className="bt-body-sm bt-muted mt-1">필요한 목적에만 동의할 수 있어요.</p>
      </header>

      {loadError && (
        <Callout tone="danger" icon="report">
          {loadError}
        </Callout>
      )}

      {!types && !loadError && (
        <div className="grid place-items-center py-10" aria-busy="true">
          <Spinner size={26} />
        </div>
      )}

      {types && (
        <>
          <Callout tone="info">
            <b>선택 항목을 거부해도 화상 연습은 그대로 이용</b>할 수 있고, 해당 분석 기능만 빠져요.
            세션 중 표정·음성 분석은 <b>세션을 시작할 때마다</b> 따로 켜고 끌 수 있어요.
          </Callout>

          <Card>
            <Stack gap={4} role="group" aria-label="목적별 동의 항목">
              {/* 필수 — 잠금형: 항상 on·비활성 (서비스 이용 전제) */}
              {required.map((t) => (
                <ConsentRow
                  key={t.consentTypeId}
                  required
                  checked
                  disabled
                  onCheckedChange={() => {}}
                  title={t.name}
                  desc={CONSENT_DESCRIPTION[t.code]}
                />
              ))}

              {optional.map((t, i) => (
                <div key={t.consentTypeId}>
                  {i === 0 && required.length > 0 && (
                    <div className="h-px bg-[var(--bt-color-border)]" />
                  )}
                  <ConsentRow
                    title={t.name}
                    desc={CONSENT_DESCRIPTION[t.code]}
                    checked={granted[t.consentTypeId] ?? false}
                    onCheckedChange={(next) =>
                      setGranted((prev) => ({ ...prev, [t.consentTypeId]: next }))
                    }
                  />
                </div>
              ))}
            </Stack>
          </Card>

          <Callout tone="info" icon={null}>
            마이페이지에서 언제든 <b>철회</b>할 수 있어요.
          </Callout>

          {submitError && (
            <span className="bt-error" role="alert">
              {submitError}
            </span>
          )}

          <Button
            variant="primary"
            size="lg"
            block
            trailingAffordance
            loading={submitting}
            onClick={onContinue}
          >
            동의하고 계속
          </Button>
        </>
      )}
    </main>
  )
}
