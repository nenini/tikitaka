import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar, Badge, Button, Callout, Card, Cluster, ExitToHomeButton, Icon, Modal, Spinner, Stack, TagChip } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { acceptMatch, cancelMatch, getCurrentMatch, rejectMatch } from './api'
import { InfoRow } from './parts'
import { formatMMSS, formatSessionTime, useNow } from './format'
import { isMatchClosed } from './types'
import type { MatchPair } from './types'

/** 상대 수락 반영 폴링 주기. match 도메인에는 STOMP 토픽이 없다. */
const POLL_INTERVAL_MS = 4_000

/**
 * W-09 매칭 카드 (MATCH-06, FE-B).
 * 규칙: 공개 필드는 닉네임·연령대·얼굴상뿐(실명·연락처·지역·키 금지) · 매칭 근거(점수) 비공개.
 * 내 세션 목표는 온보딩 '고치고 싶은 점'을 그대로 표시. 한쪽 거절·초과 시 큐 재등록.
 *
 * 백엔드 연동
 *  - 조회는 `GET /api/v1/matches/me/current` 단건. 라우트의 `:pairId` 는 힌트일 뿐이다.
 *  - 수락/거절은 바디 없는 별도 경로(`POST /matches/{id}/accept` · `/reject`).
 *  - 상대 응답을 알리는 STOMP 토픽이 없어 폴링으로 반영한다.
 *  - 상대가 거절했는지 시간이 지났는지는 **구분해 보여주지 않는다** — 종료 화면 하나로 합친다.
 */
export function MatchCardPage() {
  const navigate = useNavigate()
  const now = useNow()
  // 홈의 '일정 취소' 는 `?cancel=1` 로 들어온다 — 확인 모달을 바로 연다.
  const [searchParams] = useSearchParams()
  const cancelIntent = searchParams.get('cancel') === '1'

  const [pair, setPair] = useState<MatchPair | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [responding, setResponding] = useState<'ACCEPTED' | 'REJECTED' | null>(null)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * ⚠️ 확정돼도 **대기방으로 자동 이동하지 않는다.**
   *
   * 예전에는 `CONFIRMED` 를 보는 즉시 `/session/{id}/room` 으로 replace 했다. 그런데
   * 이 화면은 홈의 '상세'·'일정 취소' 가 도착하는 곳이기도 해서, 확정된 세션은
   * 무엇을 눌러도 대기방에 떨어졌다 — 일정을 확인할 수도, 취소할 수도 없었다.
   * 게다가 확정 시각은 보통 몇 시간 뒤라 그 시점에 대기방에 들어갈 이유도 없다.
   * 대기방 입장은 아래 버튼으로 **명시적으로** 한다.
   */
  const applyPair = useCallback((next: MatchPair | null) => {
    setPair(next)
    setLoaded(true)
  }, [])

  const load = useCallback(async () => {
    try {
      applyPair(await getCurrentMatch())
      setError(null)
    } catch (loadError) {
      setError(errorMessageOf(loadError, '매칭 정보를 불러오지 못했어요.'))
      setLoaded(true)
    }
  }, [applyPair])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  const deadlineMs = pair?.acceptDeadlineAt ? new Date(pair.acceptDeadlineAt).getTime() : null
  const remainingSec = deadlineMs != null ? Math.floor((deadlineMs - now) / 1000) : null
  const deadlinePassed = remainingSec != null && remainingSec <= 0 && pair?.status === 'PENDING_ACCEPTANCE'
  const closed = pair != null && (isMatchClosed(pair.status) || deadlinePassed)

  const confirmed = pair?.status === 'CONFIRMED'

  // 확정 상태를 확인한 **뒤에** 연다. 아직 수락 전인 매칭에 취소 모달을 띄우면
  // 사용자가 '거절'과 헷갈린다.
  useEffect(() => {
    if (cancelIntent && confirmed) setCancelOpen(true)
  }, [cancelIntent, confirmed])

  /** 시작 1시간 이내인가 — 취소 시 노쇼가 붙는 구간이라 확인 문구를 바꾼다. */
  const startAtMs = pair?.session.scheduledStartAt
    ? new Date(pair.session.scheduledStartAt).getTime()
    : null
  const lateCancel = startAtMs != null && startAtMs - now <= 60 * 60 * 1000

  /**
   * 확정된 매칭 취소. 서버가 `lateCancellation` 판정과 패널티 부과를 맡으므로
   * 여기서는 막지 않고 **무슨 일이 일어나는지만** 알린 뒤 그대로 보낸다.
   */
  async function handleCancel() {
    if (cancelling || !pair) return
    setCancelling(true)
    setError(null)
    try {
      await cancelMatch(pair.matchPairId)
      navigate('/', { replace: true })
    } catch (cancelError) {
      setError(errorMessageOf(cancelError, '일정을 취소하지 못했어요.'))
      setCancelOpen(false)
      void load() // 이미 취소·시작된 경우를 화면에 반영한다
    } finally {
      setCancelling(false)
    }
  }

  async function respond(response: 'ACCEPTED' | 'REJECTED') {
    if (responding || !pair) return
    setResponding(response)
    setError(null)
    try {
      const next =
        response === 'ACCEPTED'
          ? await acceptMatch(pair.matchPairId, pair.session.myPracticeGoal)
          : await rejectMatch(pair.matchPairId, pair.session.myPracticeGoal)

      if (response === 'REJECTED') {
        navigate('/matching') // 거절 → 큐 재등록(트랙 재선택)
        return
      }
      // 수락: 확정이면 applyPair 가 대기방으로 넘기고, 아니면 '내 수락 완료 · 상대 대기'로 남는다.
      applyPair(next)
    } catch (respondError) {
      setError(errorMessageOf(respondError, '응답을 처리하지 못했어요.'))
      // 서버 상태가 이미 바뀐 경우(만료·중복 응답)를 화면에 반영한다.
      void load()
    } finally {
      setResponding(null)
    }
  }

  if (!loaded) {
    return (
      <main className="mx-auto grid w-full max-w-[960px] place-items-center px-5 py-20">
        <Spinner size={28} />
      </main>
    )
  }

  if (!pair) {
    return (
      <main className="mx-auto w-full max-w-[520px] px-5 py-16 text-center">
        <Card className="flex flex-col items-center gap-3 py-10">
          <Icon name="bloom" size={32} style={{ color: 'var(--bt-color-text-tertiary)' }} />
          <b className="bt-h3">진행 중인 매칭이 없어요</b>
          <p className="bt-body-sm bt-muted">
            {error ?? '매칭 대기에 등록하면 조건이 맞는 상대를 찾아드려요.'}
          </p>
          <Button variant="primary" onClick={() => navigate('/matching')}>
            매칭하러 가기
          </Button>
        </Card>
      </main>
    )
  }

  if (closed) {
    // 만료·취소·상대 거절을 **구분하지 않는다**(상대 거절 비공개 정책).
    return (
      <main className="mx-auto w-full max-w-[520px] px-5 py-16 text-center">
        <Card className="flex flex-col items-center gap-3 py-10">
          <Icon name="clock" size={32} style={{ color: 'var(--bt-color-text-tertiary)' }} />
          <b className="bt-h3">이 매칭은 진행되지 않았어요</b>
          <p className="bt-body-sm bt-muted">다시 매칭 대기에 등록하면 새 상대를 찾아드려요.</p>
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
      {/* 수락 마감은 계속 흐른다 — 나가도 카드는 남아 있고 알림으로 다시 들어올 수 있다.
          카드 안이 아니라 바깥에 두어 수락/거절 버튼과 멀찍이 떨어뜨린다. */}
      <div className="mb-3 flex justify-end">
        <ExitToHomeButton />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 상대 카드 + 수락/거절 */}
        <Card className="flex flex-col gap-4 lg:max-w-[470px] lg:flex-1">
          <div className="flex items-center justify-between">
            <span className="bt-h3">{confirmed ? '세션이 확정됐어요' : '매칭이 성립했어요'}</span>
            {/* 서버가 수락 마감을 주지 않으면 카운트다운을 그리지 않는다(가짜 시한 금지).
                확정 뒤에는 수락 마감이 의미를 잃으므로 감춘다. */}
            {!confirmed && remainingSec != null && (
              <Badge tone={remainingSec <= 60 ? 'danger' : 'warning'}>
                수락 <span className="bt-numeric">{formatMMSS(remainingSec)}</span> 남음
              </Badge>
            )}
          </div>

          {/* 공개 정보가 셋뿐이라 텍스트로만 두면 카드가 빈다 — 얼굴상을 인물의 얼굴 자리에 크게 세운다 */}
          <FaceTagPortrait nickname={pair.opponent.nickname} faceTag={pair.opponent.faceTag} />

          <div className="flex flex-col items-center gap-2 text-center">
            <b style={{ fontSize: 21 }}>{pair.opponent.nickname}</b>
            <Cluster gap={6} style={{ justifyContent: 'center' }}>
              <TagChip>{pair.opponent.ageBand}</TagChip>
              {/* 얼굴상은 백엔드 매칭 응답에 없다 — 값이 생기면 그때 칩이 늘어난다 */}
              {pair.opponent.faceTag && <TagChip>{pair.opponent.faceTag}</TagChip>}
            </Cluster>
          </div>

          {error && <Callout tone="danger">{error}</Callout>}

          <Callout tone="info" icon="lock">
            공개되는 정보는 닉네임 · 연령대 · 얼굴상뿐이에요. 실명·연락처·정확한 지역은 공개되지 않습니다.
          </Callout>

          {/* 확정 전에는 수락/거절, 확정 뒤에는 입장/취소.
              두 조합을 한 줄에 섞지 않는다 — '거절'과 '일정 취소'는 결과가 다르다
              (거절은 큐 재등록, 취소는 패널티 구간이 있다). */}
          {confirmed ? (
            <div className="mt-auto flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setCancelOpen(true)}
              >
                일정 취소
              </Button>
              <Button
                variant="primary"
                style={{ flex: 2 }}
                // 세션이 아직 만들어지지 않았으면 들어갈 방이 없다.
                disabled={pair.session.sessionId == null}
                onClick={() => navigate(`/session/${pair.session.sessionId}/room`)}
              >
                {pair.session.sessionId == null ? '대기방 준비 중' : '대기방 입장'}
              </Button>
            </div>
          ) : (
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
          )}
        </Card>

        {/* 우: 세션 정보 · 수락 현황 */}
        <aside className="flex w-full flex-col gap-4 lg:flex-1">
          <Card>
            <div className="bt-h3 mb-3">세션 정보</div>
            <Stack gap={8}>
              <InfoRow
                label="일시"
                value={
                  pair.session.scheduledStartAt
                    ? `${formatSessionTime(pair.session.scheduledStartAt)} · ${pair.session.plannedDurationMin}분`
                    : '일정 확정 중'
                }
              />
              <InfoRow
                label="대기방 테마"
                value={pair.session.themeName ? `${pair.session.themeName} (자동 배정)` : '배정 중'}
              />
              <InfoRow label="내 개선 목표" value={pair.session.myPracticeGoal ?? '미설정'} />
            </Stack>

            {/* 취소 정책은 요약 한 줄 + '자세히'. 수락 전에 전문을 읽힐 필요가 없다 */}
            <div className="mt-4 flex items-start justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--bt-color-border)' }}>
              <p className="bt-caption bt-muted">
                세션 1시간 이내 취소·5분 초과 미입장은 노쇼로 처리돼요.
              </p>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setPolicyOpen(true)}>
                자세히
              </Button>
            </div>
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

      <CancelPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} />

      {/* 일정 취소 확인. 되돌릴 수 없고 상대에게도 영향이 가므로 한 번 묻는다.
          시작 1시간 이내면 패널티가 붙는다는 사실을 **누르기 전에** 알린다. */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        role="alertdialog"
        title="이 세션 일정을 취소할까요?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              돌아가기
            </Button>
            <Button variant="secondary" loading={cancelling} onClick={handleCancel}>
              일정 취소
            </Button>
          </>
        }
      >
        <Stack gap={10}>
          {lateCancel ? (
            <Callout tone="danger">
              시작 <b>1시간 이내</b> 취소라 온도가 크게 내려가고 <b>노쇼 1회</b>가 부과돼요.
            </Callout>
          ) : (
            <p className="bt-body-sm">온도가 소폭 내려가지만 노쇼 패널티는 없어요.</p>
          )}
          <p className="bt-body-sm bt-muted">
            취소하면 상대에게도 알림이 가고 이 매칭은 되돌릴 수 없어요. 다시 하려면 매칭 대기에 새로
            등록해야 합니다.
          </p>
        </Stack>
      </Modal>
    </main>
  )
}

/**
 * 얼굴상 초상. 얼굴상 태그는 `"🐰 토끼상"` 처럼 **서버가 글리프까지 포함해 내려주는 도메인 값**이라
 * 아이콘으로 치환하지 않고, 아바타 자리에 그대로 세워 인물의 인상을 대신하게 한다.
 */
function FaceTagPortrait({ nickname, faceTag }: { nickname: string; faceTag: string | null }) {
  // 얼굴상이 없으면(현재 백엔드 미제공) 닉네임 아바타로 대체한다.
  const glyph = faceTag ? Array.from(faceTag.trim())[0] : undefined
  return (
    <div className="flex justify-center py-2">
      <div
        className="grid place-items-center rounded-[50%]"
        style={{
          width: 128,
          height: 128,
          background: 'linear-gradient(150deg, var(--bt-color-action-subtle), var(--bt-color-surface-sunken))',
          border: '1px solid var(--bt-color-border)',
        }}
      >
        {glyph ? (
          <span style={{ fontSize: 56, lineHeight: 1 }} aria-hidden="true">
            {glyph}
          </span>
        ) : (
          <Avatar size="lg" round name={nickname} decorative />
        )}
      </div>
    </div>
  )
}

/** 취소 정책 전문. 요약에서 '자세히'로 들어온다. */
function CancelPolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="취소 · 노쇼 정책"
      actions={
        <Button variant="primary" onClick={onClose}>
          확인
        </Button>
      }
    >
      <Stack gap={12}>
        <Cluster gap={8} style={{ alignItems: 'center' }}>
          <Badge tone="success">1시간 이전 취소</Badge>
          <span className="bt-caption bt-muted">온도 소폭 감소 · 노쇼 패널티 없음</span>
        </Cluster>
        <Cluster gap={8} style={{ alignItems: 'center' }}>
          <Badge tone="danger">1시간 이내 취소</Badge>
          <span className="bt-caption bt-muted">온도 대폭 감소 · 노쇼 1회 부과</span>
        </Cluster>
        <p className="bt-body-sm">
          세션 시각 후 5분까지 입장하지 않으면 노쇼로 처리돼요. 노쇼 패널티는 6개월 단위로 소멸합니다.
        </p>
      </Stack>
    </Modal>
  )
}

/** 수락 상태 점(초록=완료, 회색=대기). */
function AcceptDot({ done, label }: { done: boolean; label: string }) {
  return (
    <Cluster gap={8} style={{ alignItems: 'center' }}>
      <Icon
        name={done ? 'check-circle' : 'clock'}
        size={16}
        style={{ color: done ? 'var(--bt-color-success)' : 'var(--bt-color-text-tertiary)' }}
      />
      <span className={done ? 'bt-body-sm font-medium' : 'bt-body-sm bt-muted'}>{label}</span>
    </Cluster>
  )
}
