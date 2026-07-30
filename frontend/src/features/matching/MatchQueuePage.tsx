import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Callout, Card, Field, Input, Modal, Spinner, Stack } from '@/components'
import { getQueueStatus, leaveQueue, relaxConditions } from './api'
import { InfoRow } from './parts'
import { formatMMSS, formatTimeRange, useNow } from './format'
import type { DelayReason, QueueStatus } from './types'

/**
 * W-09b 매칭 대기 큐 (MATCH-02/03, FE-B).
 * 규칙: 홈·챗봇을 이용해도 대기 큐는 유지되고 ‘큐 이탈’(DELETE)로만 해제된다.
 * 큐 이탈은 패널티·온도 감점 없음. 지연 안내는 원인별로 분기한다.
 */
export function MatchQueuePage() {
  const { requestId = 'demo' } = useParams()
  const navigate = useNavigate()
  const now = useNow()

  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [relaxOpen, setRelaxOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let alive = true
    getQueueStatus(requestId).then((s) => alive && setStatus(s))
    // TODO(FE-B WS): STOMP 'match-found' → navigate(pair), 'queue-position-updated' → setStatus
    return () => {
      alive = false
    }
  }, [requestId])

  async function handleLeave() {
    setLeaving(true)
    try {
      await leaveQueue(requestId)
      navigate('/matching')
    } finally {
      setLeaving(false)
    }
  }

  const elapsedSec = status ? Math.floor((now - new Date(status.requestedAt).getTime()) / 1000) : 0

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 py-6">
      <h1>페이지 수정중</h1>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 대기 상태 */}
        <Card className="flex flex-1 flex-col items-center gap-5 py-10 text-center">
          <Spinner size={44} color="var(--bt-color-action)" label="상대를 찾는 중" />
          <div>
            <b className="bt-h3">조건에 맞는 상대를 찾고 있어요</b>
            <p className="bt-body-sm bt-muted mt-1">
              대기 시간 <b className="bt-numeric">{formatMMSS(elapsedSec)}</b>
              {status && <> · 대기열 {status.position}번째</>}
            </p>
          </div>

          {status?.delayReason && (
            <Callout tone="warning" className="max-w-[440px] text-left">
              {DELAY_TEXT[status.delayReason]}
            </Callout>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRelaxOpen(true)}>
              조건 완화
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLeaveOpen(true)}>
              큐 이탈
            </Button>
          </div>
        </Card>

        {/* 우: 조건 요약 + 대기 유지 안내 */}
        <aside className="flex w-full flex-col gap-4 lg:w-[340px]">
          <Card>
            <CardTitle>현재 매칭 조건</CardTitle>
            {status ? (
              <Stack gap={8}>
                <InfoRow label="연령 범위" value={`${status.conditions.minPreferredAge} ~ ${status.conditions.maxPreferredAge}세`} />
                <InfoRow label="가능 시간대" value={`주 ${status.conditions.availableSlotCount}개 슬롯`} />
                <InfoRow
                  label="희망 시작"
                  value={formatTimeRange(status.conditions.preferredStartAt, status.conditions.preferredEndAt)}
                />
                <InfoRow label="제외 조건" value={`차단 ${status.conditions.blockedCount}명 · 최근 매칭`} />
              </Stack>
            ) : (
              <p className="bt-body-sm bt-muted">조건을 불러오는 중…</p>
            )}
          </Card>

          <Callout tone="info">
            <b>대기는 계속 유지돼요.</b> 이 화면을 벗어나 홈·챗봇을 이용해도 대기 큐는 유지됩니다. 매칭이
            성립하면 알림으로 알려드려요. 멈추려면 <b>‘큐 이탈’</b>만 누르면 돼요.
            <div className="mt-2">
              <Button variant="secondary" size="sm" block onClick={() => navigate('/chatbot/persona')}>
                💬 대기하면서 AI 챗봇 연습
              </Button>
            </div>
          </Callout>

          {/* 데모 전용: WS 미연동 상태에서 매칭 성립 전환 확인용 */}
          {import.meta.env.DEV && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/matching/pair/demo')}>
              ▶ 매칭 성립 시뮬레이션 (dev)
            </Button>
          )}
        </aside>
      </div>

      {/* 조건 완화 모달 */}
      <RelaxModal
        open={relaxOpen}
        current={status}
        onClose={() => setRelaxOpen(false)}
        onSaved={(next) => {
          setStatus(next)
          setRelaxOpen(false)
        }}
        requestId={requestId}
      />

      {/* 큐 이탈 확인 */}
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        role="alertdialog"
        title="대기를 멈출까요?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              계속 대기
            </Button>
            <Button variant="secondary" loading={leaving} onClick={handleLeave}>
              큐 이탈
            </Button>
          </>
        }
      >
        큐에서 나가도 <b>패널티나 온도 감점은 없어요.</b> 다시 매칭하려면 트랙을 새로 선택하면 됩니다.
      </Modal>
    </main>
  )
}

const DELAY_TEXT: Record<DelayReason, string> = {
  SLOT_NARROW:
    '평소보다 오래 걸리고 있어요. 가능한 시간대를 넓히거나 연령 범위를 조정하면 더 빨리 매칭될 수 있어요.',
  AGE_RANGE: '연령 범위가 좁아 후보가 적어요. 범위를 넓히면 매칭이 더 빨라져요.',
  CANDIDATE_SHORTAGE: '지금은 후보가 적어요. 조금만 기다리면 새 후보가 들어와요.',
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="bt-h3 mb-3">{children}</div>
}

/** 조건 완화 — 연령 범위 조정(최소 구현). 시간대 편집은 개인정보 수정으로 이관. */
function RelaxModal({
  open,
  current,
  requestId,
  onClose,
  onSaved,
}: {
  open: boolean
  current: QueueStatus | null
  requestId: string
  onClose: () => void
  onSaved: (next: QueueStatus) => void
}) {
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [saving, setSaving] = useState(false)

  // 모달이 열릴 때 현재값으로 초기화
  useEffect(() => {
    if (open && current) {
      setMin(String(current.conditions.minPreferredAge))
      setMax(String(current.conditions.maxPreferredAge))
    }
  }, [open, current])

  async function save() {
    setSaving(true)
    try {
      const next = await relaxConditions(requestId, {
        minPreferredAge: Number(min),
        maxPreferredAge: Number(max),
      })
      onSaved(next)
    } finally {
      setSaving(false)
    }
  }

  const invalid = !min || !max || Number(min) > Number(max)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="매칭 조건 완화"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={saving} disabled={invalid} onClick={save}>
            적용
          </Button>
        </>
      }
    >
      <p className="bt-body-sm bt-muted mb-3">연령 범위를 넓히면 매칭될 후보가 늘어나요.</p>
      <div className="flex items-end gap-3">
        <Field label="최소 연령">
          {({ id }) => (
            <Input id={id} type="number" inputMode="numeric" min={19} max={99} value={min} onChange={(e) => setMin(e.currentTarget.value)} />
          )}
        </Field>
        <span className="bt-muted pb-2">~</span>
        <Field label="최대 연령">
          {({ id }) => (
            <Input id={id} type="number" inputMode="numeric" min={19} max={99} value={max} onChange={(e) => setMax(e.currentTarget.value)} />
          )}
        </Field>
      </div>
    </Modal>
  )
}
