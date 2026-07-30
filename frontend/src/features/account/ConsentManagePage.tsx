import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertDialog, Button, Callout, Card, CardHeader, ConsentRow, Stack } from '@/components'

/* -------------------------------------------------------------------------- */
/*  AUTH-03 · 개인정보 동의 관리 (FE-CONSENT-02 · /me/consent)                  */
/*  1차 확정 옵션:                                                            */
/*   ① 철회 = 확인 다이얼로그   ② 필수(약관) 숨김(선택 항목만 노출)             */
/*   ③ 기존 데이터 삭제 요청 제공   ④ 통합 1카드                               */
/*   ⑤ 동의 일자 표시   ⑥ 삭제 요청 = 전체 일괄만                             */
/*  - 데이터 데모 고정. TODO(CONSENT): GET/PATCH /api/v1/consents,             */
/*    POST /api/v1/consents/data-deletion (처리방침 §22)                       */
/* -------------------------------------------------------------------------- */

type ConsentKey = 'face' | 'expression' | 'voice' | 'report'

interface ManagedConsent {
  key: ConsentKey
  title: string
  desc: string
}

/** 관리 대상 = 선택 동의 4항목. 필수(이용약관·개인정보 처리)는 서비스 조건이라 여기서 다루지 않는다. */
const ITEMS: ManagedConsent[] = [
  {
    key: 'face',
    title: '얼굴 촬영 및 얼굴상 분석',
    desc: '분석 후 원본 이미지는 즉시 삭제해요. 끄면 얼굴상 태그가 생략됩니다.',
  },
  {
    key: 'expression',
    title: '세션 중 표정 · 시선 분석',
    desc: '원본 영상은 저장하지 않고 지표만 저장해요. 끄면 표정 코칭이 제공되지 않아요.',
  },
  {
    key: 'voice',
    title: '세션 중 음성 · 대화 분석',
    desc: '원본 음성 저장 여부는 별도로 고지해요. 끄면 대화 코칭이 제공되지 않아요.',
  },
  {
    key: 'report',
    title: '누적 성장 리포트 저장',
    desc: '점수 · 키워드 · 통계값만 저장해요. 끄면 리포트 축소판으로 제공됩니다.',
  },
]

interface ConsentState {
  on: boolean
  date: string | null
}

/** 데모 초기 상태. TODO(CONSENT): 서버 조회로 대체. */
const INITIAL: Record<ConsentKey, ConsentState> = {
  face: { on: true, date: '2026-07-14' },
  expression: { on: true, date: '2026-07-14' },
  voice: { on: false, date: null },
  report: { on: true, date: '2026-07-14' },
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function ConsentManagePage() {
  const navigate = useNavigate()
  const [consents, setConsents] = useState<Record<ConsentKey, ConsentState>>(INITIAL)
  const [pending, setPending] = useState<ConsentKey | null>(null) // 철회 확인 대상
  const [deleteOpen, setDeleteOpen] = useState(false)

  const onChange = (key: ConsentKey, next: boolean) => {
    if (next) {
      // 재동의(다시 켜기) — 즉시 반영
      setConsents((s) => ({ ...s, [key]: { on: true, date: todayISO() } }))
      // TODO(CONSENT): PATCH /api/v1/consents/{key} { granted: true }
    } else {
      // 철회(끄기) — 확인 다이얼로그로 게이트 (①)
      setPending(key)
    }
  }

  const confirmWithdraw = () => {
    if (pending) {
      setConsents((s) => ({ ...s, [pending]: { on: false, date: null } }))
      // TODO(CONSENT): PATCH /api/v1/consents/{pending} { granted: false }
    }
    setPending(null)
  }

  const requestDelete = () => {
    // TODO(CONSENT): POST /api/v1/consents/data-deletion (§22)
    console.log('request existing-data deletion (all)')
    setDeleteOpen(false)
  }

  const pendingTitle = pending ? ITEMS.find((i) => i.key === pending)?.title : ''

  return (
    <main className="mx-auto w-full max-w-[640px] px-4 pt-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/me')}>
          ‹ 마이페이지
        </Button>
        <h1 className="bt-h2">개인정보 동의 관리</h1>
      </div>
      <p className="bt-body-sm bt-muted mb-4">
        목적별로 켜고 끌 수 있어요. 켜둔 항목만 해당 AI 분석이 동작해요. 이용약관·개인정보 처리는 서비스 이용 조건이라
        여기서 관리하지 않아요.
      </p>

      {/* ④ 통합 1카드 — ② 선택 동의 항목만(필수 숨김) */}
      <Card>
        <Stack gap={4}>
          {ITEMS.map((it) => {
            const c = consents[it.key]
            return (
              <ConsentRow
                key={it.key}
                title={it.title}
                desc={
                  <>
                    {it.desc}
                    {/* ⑤ 동의 일자 표시 */}
                    {c.on && c.date && <span className="bt-caption mt-1 block">✓ {c.date} 동의</span>}
                  </>
                }
                checked={c.on}
                onCheckedChange={(next) => onChange(it.key, next)}
              />
            )
          })}
        </Stack>
      </Card>

      <Callout tone="info" className="mt-3">
        철회하면 <b>신규 AI 분석이 중단</b>돼요(언제든 다시 켤 수 있어요). 이미 분석된 데이터는 아래에서 삭제 요청할 수
        있어요.
      </Callout>

      {/* ③⑥ 기존 분석 데이터 삭제 요청 — 전체 일괄 */}
      <Card className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardHeader title="기존 분석 데이터 삭제 요청" />
            <p className="bt-caption mt-1">
              철회와 별개로, 이미 분석·저장된 데이터의 삭제를 요청해요(처리방침 §22).
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            삭제 요청
          </Button>
        </div>
      </Card>

      {/* ① 철회 확인 다이얼로그 */}
      <AlertDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={confirmWithdraw}
        tone="danger"
        title="이 동의를 철회할까요?"
        description={
          pending ? `철회하면 ${pendingTitle} 관련 신규 AI 분석이 중단돼요. 언제든 다시 켤 수 있어요.` : ''
        }
        confirmLabel="철회하기"
        cancelLabel="취소"
      />

      {/* 기존 데이터 삭제 요청 확인 */}
      <AlertDialog
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={requestDelete}
        tone="danger"
        title="기존 분석 데이터 삭제를 요청할까요?"
        description="저장된 분석 데이터(점수·키워드·통계 등)의 삭제를 요청해요. 처리에는 최대 30일이 걸릴 수 있어요(§22)."
        confirmLabel="삭제 요청"
        cancelLabel="취소"
      />
    </main>
  )
}
