import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Callout, Card, Cluster, Spinner, Stack, TagChip } from '@/components'
import { getMatchPair, respondToPair } from './api'
import { InfoRow } from './parts'
import { formatMMSS, formatSessionTime, useNow } from './format'
import type { MatchPair } from './types'

/**
 * W-09 매칭 카드 (MATCH-06, FE-B).
 * 규칙: 공개 필드는 닉네임·연령대·얼굴상뿐(실명·연락처·지역·키 금지) · 매칭 근거(점수) 비공개.
 * 내 세션 목표는 온보딩 '고치고 싶은 점'을 그대로 표시. 한쪽 거절·초과 시 큐 재등록.
 */
export function MatchCardPage() {
  const { pairId = 'demo' } = useParams()
  const navigate = useNavigate()
  const now = useNow()

  const [pair, setPair] = useState<MatchPair | null>(null)
  const [responding, setResponding] = useState<'ACCEPTED' | 'REJECTED' | null>(null)

  useEffect(() => {
    let alive = true
    getMatchPair(pairId).then((p) => alive && setPair(p))
    // TODO(FE-B WS): 'match-response-updated'(상대 수락 반영) · 'match-confirmed' · 'match-expired'
    return () => {
      alive = false
    }
  }, [pairId])

  const remainingSec = pair ? Math.floor((new Date(pair.acceptDeadlineAt).getTime() - now) / 1000) : 0
  const expired = pair != null && remainingSec <= 0 && pair.status !== 'CONFIRMED'

  async function respond(response: 'ACCEPTED' | 'REJECTED') {
    if (responding || !pair) return
    setResponding(response)
    try {
      const next = await respondToPair(pairId, response)
      setPair(next)
      if (response === 'REJECTED') {
        navigate('/matching') // 거절 → 큐 재등록(트랙 재선택)
      } else if (next.status === 'CONFIRMED') {
        navigate(`/session/${next.session.sessionId}/room`) // 양측 수락 → 대기방
      }
      // ACCEPTED이지만 상대 미수락이면 화면에 '내 수락 완료 · 상대 대기'로 남는다
    } finally {
      setResponding(null)
    }
  }

  if (!pair) {
    return (
      <main className="mx-auto grid w-full max-w-[960px] place-items-center px-5 py-20">
        <Spinner size={28} />
      </main>
    )
  }

  if (expired) {
    return (
      <main className="mx-auto w-full max-w-[520px] px-5 py-16 text-center">
        <Card className="flex flex-col items-center gap-3 py-10">
          <span style={{ fontSize: 32 }} aria-hidden="true">
            ⏰
          </span>
          <b className="bt-h3">수락 시간이 만료됐어요</b>
          <p className="bt-body-sm bt-muted">다시 대기 큐에 등록하면 새 상대를 찾아드려요.</p>
          <Button variant="primary" onClick={() => navigate('/matching')}>
            다시 매칭하기
          </Button>
        </Card>
      </main>
    )
  }

  const myAccepted = pair.myResponse === 'ACCEPTED'

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 상대 카드 + 수락/거절 */}
        <Card className="flex flex-col gap-4 lg:max-w-[470px] lg:flex-1">
          <div className="flex items-center justify-between">
            <span className="bt-h3">매칭이 성립했어요</span>
            <Badge tone={remainingSec <= 60 ? 'danger' : 'warning'}>
              수락 <span className="bt-numeric">{formatMMSS(remainingSec)}</span> 남음
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            <Avatar size="lg" round name={pair.opponent.nickname} />
            <div className="flex flex-col gap-1.5">
              <b style={{ fontSize: 19 }}>{pair.opponent.nickname}</b>
              <Cluster gap={6}>
                <TagChip>{pair.opponent.ageBand}</TagChip>
                <TagChip>{pair.opponent.faceTag}</TagChip>
              </Cluster>
            </div>
          </div>

          <Callout tone="info" icon="lock">
            공개되는 정보는 <b>닉네임 · 연령대 · 얼굴상</b>뿐이에요. 실명·연락처·정확한 지역·키는 공개되지
            않습니다.
          </Callout>

          <div className="mt-auto flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              loading={responding === 'REJECTED'}
              disabled={myAccepted}
              onClick={() => respond('REJECTED')}
            >
              거절
            </Button>
            <Button
              variant="primary"
              style={{ flex: 2 }}
              loading={responding === 'ACCEPTED'}
              disabled={myAccepted}
              onClick={() => respond('ACCEPTED')}
            >
              {myAccepted ? '수락 완료 · 상대 대기' : '수락하기'}
            </Button>
          </div>
        </Card>

        {/* 우: 세션 정보 · 취소 정책 · 수락 현황 */}
        <aside className="flex w-full flex-col gap-4 lg:flex-1">
          <Card>
            <div className="bt-h3 mb-3">세션 정보</div>
            <Stack gap={8}>
              <InfoRow
                label="일시"
                value={`${formatSessionTime(pair.session.scheduledStartAt)} · ${pair.session.plannedDurationMin}분`}
              />
              <InfoRow
                label="대기방 테마"
                value={`${pair.session.themeEmoji} ${pair.session.themeName} (자동 배정)`}
              />
              <InfoRow label="내 개선 목표" value={pair.session.myPracticeGoal} />
            </Stack>
          </Card>

          <Card>
            <div className="bt-h3 mb-3">취소 정책</div>
            <Stack gap={10}>
              <Cluster gap={8} style={{ alignItems: 'center' }}>
                <Badge tone="success">1시간 이전</Badge>
                <span className="bt-caption bt-muted">온도 소폭 감소 · 노쇼 패널티 없음</span>
              </Cluster>
              <Cluster gap={8} style={{ alignItems: 'center' }}>
                <Badge tone="danger">1시간 이내</Badge>
                <span className="bt-caption bt-muted">온도 대폭 감소 · 노쇼 1회 부과</span>
              </Cluster>
              <p className="bt-caption bt-muted">
                세션 시각 후 <b>5분</b>까지 미입장하면 노쇼로 처리돼요. 노쇼 패널티는 6개월 단위로
                소멸합니다.
              </p>
            </Stack>
          </Card>

          <Card variant="inset">
            <div className="bt-h3 mb-3">양측 수락 현황</div>
            <Stack gap={8}>
              <AcceptDot done={pair.opponentAccepted} label={pair.opponentAccepted ? '상대 수락 완료' : '상대 응답 대기 중'} />
              <AcceptDot done={myAccepted} label={myAccepted ? '내 수락 완료' : '내 응답 대기 중'} />
            </Stack>
          </Card>
        </aside>
      </div>
    </main>
  )
}

/** 수락 상태 점(초록=완료, 회색=대기). */
function AcceptDot({ done, label }: { done: boolean; label: string }) {
  return (
    <Cluster gap={8} style={{ alignItems: 'center' }}>
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: done ? 'var(--bt-color-success)' : 'var(--bt-color-text-tertiary)' }}
        aria-hidden="true"
      />
      <span className={done ? 'bt-body-sm font-medium' : 'bt-body-sm bt-muted'}>{label}</span>
    </Cluster>
  )
}
