import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, Icon, Modal, Stack, TagChip } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getCurrentMatchRequest, leaveQueue, updateMatchRequest } from './api'
import { QueueSetupModal } from './QueueSetupModal'
import { InfoRow } from './parts'
import { formatMMSS, useNow } from './format'
import { summarizeSlots } from './types'
import type { DelayReason, MatchRequestInput, QueueStatus } from './types'

/**
 * W-09b 매칭 대기 큐 (MATCH-02/03, FE-B).
 *
 * ⚠️ 이 화면은 **진행률을 보여줄 수 없다.** 매칭은 내 순서가 앞당겨지는 줄서기가 아니라,
 *    조건이 맞는 다른 사용자가 큐에 들어오기를 기다리는 일이라 남은 시간·진척도를 계산할 근거가 없다.
 *    그래서 가짜 진행바·예상 시간·순번을 쓰지 않고, 대신 ① 지금 무슨 일이 일어나는지
 *    ② 기다리는 동안 할 수 있는 일 ③ 언제든 멈출 수 있다는 사실을 화면에 남긴다.
 *
 * 규칙: 홈·챗봇을 이용해도 대기는 유지되고 ‘매칭 대기 취소’(DELETE)로만 해제된다.
 * 취소는 패널티·온도 감점 없음.
 *
 * 화면 문구에는 ‘큐’ 를 쓰지 않는다 — 개발 용어라 일반 사용자에게 전달되지 않는다.
 * 코드·주석에서는 서버 개념을 가리킬 때 그대로 쓴다.
 *
 * 백엔드 연동
 *  - 조회는 `GET /api/v1/match-requests/me/current` 단건뿐이다(요청 id 로 조회하는 엔드포인트가 없다).
 *    라우트의 `:requestId` 는 링크 복구용 힌트로만 남는다.
 *  - 매칭 성립을 알리는 **STOMP 토픽이 없다**(`RoomStompAuthInterceptor` 화이트리스트에
 *    match 관련 destination 이 없음) → 폴링으로 성립을 감지한다.
 *  - 조건 완화는 `PUT .../me/current` 이며 **전체 교체**라 슬롯까지 함께 보낸다.
 */

/** 성립 감지 폴링 주기. 서버 매칭 워커는 1초 주기지만 화면은 이 정도면 충분하다. */
const POLL_INTERVAL_MS = 5_000

export function MatchQueuePage() {
  const navigate = useNavigate()
  const now = useNow()

  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [relaxOpen, setRelaxOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // 폴링 콜백이 항상 최신 navigate 를 쓰도록 ref 에 담는다(effect 재구독 방지).
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const load = useCallback(async () => {
    try {
      const current = await getCurrentMatchRequest()
      if (!current) {
        // 대기 요청이 사라졌다(이탈·만료) → 트랙 선택으로 돌려보낸다.
        navigateRef.current('/matching', { replace: true })
        return
      }
      setStatus(current)
      setLoadError(null)
      if (current.matched) {
        // 성립 — 매칭 카드로. 카드 화면도 me/current 로 조회하므로 경로 id 는 힌트다.
        navigateRef.current('/matching/pair/current', { replace: true })
      }
    } catch (error) {
      setLoadError(errorMessageOf(error, '대기 상태를 불러오지 못했어요.'))
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  async function handleLeave() {
    setLeaving(true)
    try {
      await leaveQueue()
      navigate('/matching')
    } catch (error) {
      setLoadError(errorMessageOf(error, '매칭 대기를 취소하지 못했어요.'))
      setLeaveOpen(false)
    } finally {
      setLeaving(false)
    }
  }

  async function handleRelax(input: MatchRequestInput) {
    const next = await updateMatchRequest(input)
    setStatus(next)
    setRelaxOpen(false)
  }

  const elapsedSec = status ? Math.floor((now - new Date(status.requestedAt).getTime()) / 1000) : 0

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 py-6">
      <header className="mb-5">
        <h1 className="bt-h1">상대를 찾고 있어요</h1>
        <p className="bt-body bt-muted mt-1">
          조건이 맞는 사람이 나타나면 바로 연결해 드려요.
        </p>
      </header>

      {loadError && (
        <Callout tone="danger" className="mb-4">
          {loadError}
        </Callout>
      )}

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
            <Button
              variant="secondary"
              size="sm"
              disabled={!status}
              onClick={() => setRelaxOpen(true)}
            >
              조건 완화
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLeaveOpen(true)}>
              매칭 대기 취소
            </Button>
          </div>
        </Card>

        {/* 우: 조건 요약 + 기다리는 동안 할 일 */}
        <aside className="flex w-full flex-col gap-4 lg:w-[340px]">
          <Card>
            <div className="bt-h3 mb-3">현재 매칭 조건</div>
            {status ? (
              <Stack gap={8}>
                <InfoRow
                  label="연령 범위"
                  value={`${status.conditions.preferredAgeMin} ~ ${status.conditions.preferredAgeMax}세`}
                />
                <InfoRow label="가능 시간대" value={summarizeSlots(status.conditions.availableSlots)} />
                {status.conditions.preferredFaceTag && (
                  <InfoRow label="선호 얼굴상" value={status.conditions.preferredFaceTag.name} />
                )}
                {status.conditions.preferredTraits.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="bt-body-sm bt-muted">선호 성격</span>
                    <div className="flex flex-wrap gap-1.5">
                      {status.conditions.preferredTraits.map((trait) => (
                        <TagChip key={trait.id}>{trait.name}</TagChip>
                      ))}
                    </div>
                  </div>
                )}
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

      {/* 조건 완화 — PUT 은 전체 교체라 큐 등록과 같은 입력을 다시 받는다 */}
      <QueueSetupModal
        open={relaxOpen}
        onClose={() => setRelaxOpen(false)}
        onSubmit={handleRelax}
        initial={status?.conditions}
        title="매칭 조건 완화"
        description="연령 범위나 시간대를 넓히면 맞는 후보가 늘어나요."
        submitLabel="조건 적용"
      />

      {/* 매칭 대기 취소 확인 */}
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        role="alertdialog"
        title="매칭 대기를 취소할까요?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              계속 기다리기
            </Button>
            <Button variant="secondary" loading={leaving} onClick={handleLeave}>
              대기 취소
            </Button>
          </>
        }
      >
        취소해도 패널티나 온도 감점은 없어요. 다시 매칭하려면 트랙을 새로 선택하면 됩니다.
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

/**
 * 지연 사유 안내.
 * ⚠️ 백엔드가 지연 사유를 내려주지 않아(엔드포인트 없음) 지금은 렌더되지 않는다.
 *    서버가 붙으면 `toQueueStatus` 매핑만 채우면 이 문구들이 살아난다.
 */
const DELAY_TEXT: Record<DelayReason, string> = {
  SLOT_NARROW: '가능한 시간대가 좁아 맞는 상대가 적어요. 시간대를 넓히면 만날 확률이 올라가요.',
  AGE_RANGE: '연령 범위가 좁아 후보가 적어요. 범위를 넓히면 매칭될 확률이 올라가요.',
  CANDIDATE_SHORTAGE: '지금은 대기 중인 사람이 적어요. 저녁 시간대에 사람이 가장 많아요.',
}
