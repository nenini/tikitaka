import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertDialog, Button, Callout, Card, ConsentRow, Spinner, Stack } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getMyConsents, saveMyConsents, withdrawMyConsent } from '@/features/consent/api'
import { CONSENT_DESCRIPTION, isRequiredConsent, type UserConsentStatus } from '@/features/consent/types'

/* -------------------------------------------------------------------------- */
/*  AUTH-03 · 개인정보 동의 관리 (/me/consent)                                  */
/*                                                                            */
/*  확정 계약(2026-08-04, CONTRACT_DECISIONS.md A8):                           */
/*   - 관리 대상은 **선택 동의뿐**(현재 얼굴 1건). 필수(통합)는 서비스 이용      */
/*     조건이라 철회 대상이 아니어서 목록에 넣지 않는다.                        */
/*   - 표정·음성은 세션 설정으로 이관했다 — 여기서 다루지 않는다.               */
/*   - 리포트 저장은 통합 동의에 포함이라 별도 항목이 없다.                     */
/*                                                                            */
/*  UI 원칙: ① 철회 = 확인 다이얼로그  ② 동의 일자 표시  ③ 통합 1카드           */
/* -------------------------------------------------------------------------- */

export function ConsentManagePage() {
  const navigate = useNavigate()

  const [items, setItems] = useState<UserConsentStatus[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  /** 철회 확인 대상 */
  const [pending, setPending] = useState<UserConsentStatus | null>(null)
  /** 처리 중인 항목 id — 연타로 중복 요청이 나가지 않게 막는다 */
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    getMyConsents()
      .then((list) => {
        // 필수는 철회할 수 없으므로 관리 화면에 올리지 않는다
        if (alive) setItems(list.filter((c) => !isRequiredConsent(c.code)))
      })
      .catch((error) => {
        if (alive) setLoadError(errorMessageOf(error, '동의 상태를 불러오지 못했어요.'))
      })
    return () => {
      alive = false
    }
  }, [])

  function replace(next: UserConsentStatus) {
    setItems((prev) =>
      prev?.map((c) => (c.consentTypeId === next.consentTypeId ? next : c)) ?? prev,
    )
  }

  /** 재동의(다시 켜기). 서버 응답으로 상태를 갈아끼워 동의 일자까지 정확히 맞춘다. */
  async function grant(item: UserConsentStatus) {
    setBusyId(item.consentTypeId)
    setActionError(null)
    try {
      const saved = await saveMyConsents({
        consents: [{ consentTypeId: item.consentTypeId, consented: true }],
      })
      const next = saved.find((c) => c.consentTypeId === item.consentTypeId)
      if (next) replace(next)
    } catch (error) {
      setActionError(errorMessageOf(error, '동의를 저장하지 못했어요.'))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmWithdraw() {
    const item = pending
    setPending(null)
    if (!item) return
    setBusyId(item.consentTypeId)
    setActionError(null)
    try {
      replace(await withdrawMyConsent(item.consentTypeId))
    } catch (error) {
      setActionError(errorMessageOf(error, '철회하지 못했어요.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-[640px] px-4 pt-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/me')}>
          ‹ 마이페이지
        </Button>
        <h1 className="bt-h2">개인정보 동의 관리</h1>
      </div>
      <p className="bt-body-sm bt-muted mb-4">
        선택 동의를 켜고 끌 수 있어요. 이용약관·개인정보 처리는 서비스 이용 조건이라 여기서 관리하지
        않아요. 세션 중 표정·음성 분석은 세션을 시작할 때마다 따로 설정해요.
      </p>

      {loadError && (
        <Callout tone="danger" icon="report">
          {loadError}
        </Callout>
      )}

      {!items && !loadError && (
        <div className="grid place-items-center py-10" aria-busy="true">
          <Spinner size={26} />
        </div>
      )}

      {items && items.length === 0 && (
        <Callout tone="info">관리할 선택 동의 항목이 없어요.</Callout>
      )}

      {items && items.length > 0 && (
        <Card>
          <Stack gap={4}>
            {items.map((c) => (
              <ConsentRow
                key={c.consentTypeId}
                title={c.name}
                desc={
                  <>
                    {CONSENT_DESCRIPTION[c.code]}
                    {c.consented && c.consentedAt && (
                      <span className="bt-caption mt-1 block">
                        ✓ {c.consentedAt.slice(0, 10)} 동의
                      </span>
                    )}
                  </>
                }
                checked={c.consented}
                disabled={busyId === c.consentTypeId}
                onCheckedChange={(next) => {
                  // 켜기는 즉시, 끄기는 확인 다이얼로그를 거친다
                  if (next) void grant(c)
                  else setPending(c)
                }}
              />
            ))}
          </Stack>
        </Card>
      )}

      {actionError && (
        <span className="bt-error mt-3 block" role="alert">
          {actionError}
        </span>
      )}

      <Callout tone="info" className="mt-3">
        철회하면 <b>신규 분석이 중단</b>돼요. 언제든 다시 켤 수 있어요.
      </Callout>

      {/* 기존 분석 데이터 삭제 요청은 대응 API 가 없어 화면에서 내렸다.
          가짜 버튼을 두면 요청이 접수된 것처럼 보인다(처리방침 §22 · 백엔드 협의 항목). */}

      <AlertDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={confirmWithdraw}
        tone="danger"
        title="이 동의를 철회할까요?"
        description={
          pending
            ? `철회하면 ${pending.name} 관련 신규 분석이 중단돼요. 언제든 다시 켤 수 있어요.`
            : ''
        }
        confirmLabel="철회하기"
        cancelLabel="취소"
      />
    </main>
  )
}
