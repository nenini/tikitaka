import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Callout, Card, Field, Icon, Input, Modal, Stack } from '@/components'
import { getQueueStatus, leaveQueue, relaxConditions } from './api'
import { InfoRow } from './parts'
import { formatMMSS, formatTimeRange, useNow } from './format'
import type { DelayReason, QueueStatus } from './types'

/**
 * W-09b 매칭 대기 큐 (MATCH-02/03, FE-B).
 *
 * ⚠️ 이 화면은 **진행률을 보여줄 수 없다.** 매칭은 내 순서가 앞당겨지는 줄서기가 아니라,
 *    조건이 맞는 다른 사용자가 큐에 들어오기를 기다리는 일이라 남은 시간·진척도를 계산할 근거가 없다.
 *    그래서 가짜 진행바·예상 시간·순번을 쓰지 않고, 대신 ① 지금 무슨 일이 일어나는지
 *    ② 기다리는 동안 할 수 있는 일 ③ 언제든 멈출 수 있다는 사실을 화면에 남긴다.
 *
 * 규칙: 홈·챗봇을 이용해도 대기 큐는 유지되고 ‘큐 이탈’(DELETE)로만 해제된다.
 * 큐 이탈은 패널티·온도 감점 없음.
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
    // TODO(FE-B WS): STOMP 'match-found' → navigate(pair)
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
      <header className="mb-5">
        <h1 className="bt-h1">상대를 찾고 있어요</h1>
        <p className="bt-body bt-muted mt-1">
          조건이 맞는 사람이 대기 큐에 들어오면 바로 연결해 드려요.
        </p>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 대기 상태 */}
        <Card className="flex flex-1 flex-col items-center gap-5 py-10 text-center">
          <WaitingBeacon />

          <div>
            <b className="bt-h3">대기 중</b>
            <p className="bt-body-sm bt-muted mt-1">
              기다린 시간 <span className="bt-numeric">{formatMMSS(elapsedSec)}</span>
            </p>
          </div>

          {/* 왜 남은 시간을 못 알려주는지 먼저 말한다 — 침묵보다 설명이 낫다 */}
          <p className="bt-body-sm bt-muted max-w-[380px]">
            조건이 맞는 상대가 나타나는 즉시 연결됩니다.
          </p>

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

          {/* 데모 전용: WS 미연동 상태에서 매칭 성립 전환 확인용 */}
          {import.meta.env.DEV && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/matching/pair/demo')}>
              매칭 성립 시뮬레이션 (dev)
            </Button>
          )}
        </Card>

        {/* 우: 조건 요약 + 기다리는 동안 할 일 */}
        <aside className="flex w-full flex-col gap-4 lg:w-[340px]">
          <Card>
            <div className="bt-h3 mb-3">현재 매칭 조건</div>
            {status ? (
              <Stack gap={8}>
                <InfoRow
                  label="연령 범위"
                  value={`${status.conditions.minPreferredAge} ~ ${status.conditions.maxPreferredAge}세`}
                />
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
            <p className="bt-caption bt-muted mt-3">
              조건이 좁을수록 맞는 상대가 나타나기까지 오래 걸려요.
            </p>
          </Card>

          <Card variant="inset">
            <div className="bt-h3 mb-2">기다리는 동안</div>
            <Stack gap={10}>
              <WaitTip icon="home">
                이 화면을 벗어나도 대기는 유지돼요. 매칭이 성립하면 알림으로 알려드려요.
              </WaitTip>
              <WaitTip icon="chat">
                텍스트로 대화 감각을 익혀두면 실제 세션이 한결 편해져요.
              </WaitTip>
              <Button variant="secondary" size="sm" block onClick={() => navigate('/chatbot/persona')}>
                AI 챗봇으로 연습하기
              </Button>
            </Stack>
          </Card>
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
        큐에서 나가도 패널티나 온도 감점은 없어요. 다시 매칭하려면 트랙을 새로 선택하면 됩니다.
      </Modal>
    </main>
  )
}

/**
 * 대기 표시등. 스피너는 "곧 끝난다"는 인상을 주는데 여기서는 그게 거짓말이라,
 * 진행을 흉내내지 않고 **살아 있음**만 알리는 느린 맥박으로 그린다.
 */
function WaitingBeacon() {
  return (
    <div className="bt-beacon" role="status" aria-label="상대를 찾는 중">
      <span className="bt-beacon__ring" aria-hidden="true" />
      <span className="bt-beacon__ring bt-beacon__ring--delayed" aria-hidden="true" />
      <span className="bt-beacon__core" aria-hidden="true">
        <Icon name="bloom" size={26} />
      </span>
    </div>
  )
}

function WaitTip({ icon, children }: { icon: 'home' | 'chat'; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name={icon} size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--bt-color-action)' }} />
      <span className="bt-body-sm">{children}</span>
    </div>
  )
}

const DELAY_TEXT: Record<DelayReason, string> = {
  SLOT_NARROW: '가능한 시간대가 좁아 맞는 상대가 적어요. 시간대를 넓히면 만날 확률이 올라가요.',
  AGE_RANGE: '연령 범위가 좁아 후보가 적어요. 범위를 넓히면 매칭될 확률이 올라가요.',
  CANDIDATE_SHORTAGE: '지금은 대기 중인 사람이 적어요. 저녁 시간대에 사람이 가장 많아요.',
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
      <p className="bt-caption bt-muted mt-3">
        가능한 시간대는 마이페이지 &gt; 개인정보 수정에서 바꿀 수 있어요.
      </p>
    </Modal>
  )
}
