import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Callout, Card, Cluster, Progress, Spinner, Stack } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getPublicProfile } from '@/features/profile/api'
import { getReportStatus } from '@/features/report/api'
import type { ReportStatus } from '@/features/report/types'
import { useIsCompactViewport } from '@/shared/lib/useIsCompactViewport'
import {
  getEvaluationItems,
  getEvaluationStatus,
  getReceivedEvaluation,
  submitEvaluation,
} from './api'
import { canOpenReport, PHASE_NOTICE, resolveSessionEndPhase } from './sessionEndFlow'
// OverflowMenu 는 아래 '이 세션 관리' 블록을 다시 켤 때 함께 import 한다(현재 주석 처리됨).
import { FreeTextField, MetricRow, ReportBlockDialog } from './parts'
import { formatDeadline } from './format'
import type {
  EvaluationItemKey,
  EvaluationItems,
  EvaluationScores,
  EvaluationStatus,
  ReceivedEvaluation,
} from './types'

/** 화면이 다루는 상대 정보. `/items` 는 userId 만 주므로 닉네임은 공개 프로필에서 채운다. */
interface Opponent {
  userId: number
  nickname: string
}

export function PeerReviewPage() {
  const { sessionId: sessionIdParam } = useParams()
  const navigate = useNavigate()
  const compact = useIsCompactViewport()

  // 라우트 파라미터는 문자열이지만 서버 계약은 Long 이다. 숫자가 아니면 조회 자체를 하지 않는다.
  const sessionId = Number(sessionIdParam)
  const sessionIdValid = Number.isInteger(sessionId) && sessionId > 0

  const [items, setItems] = useState<EvaluationItems | null>(null)
  const [status, setStatus] = useState<EvaluationStatus | null>(null)
  const [opponent, setOpponent] = useState<Opponent | null>(null)
  const [received, setReceived] = useState<ReceivedEvaluation | null>(null)

  const [scores, setScores] = useState<Partial<EvaluationScores>>({})
  const [goodText, setGoodText] = useState('')
  const [improveText, setImproveText] = useState('')

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  /** 리포트 생성 상태. null 이면 서버에 리포트 기능이 아직 없다는 뜻이다. */
  const [reportStatus, setReportStatus] = useState<ReportStatus | null>(null)

  /**
   * 화면 데이터 적재.
   * 데모 폴백을 두지 않는다 — 실패하면 실패로 보여주고 재시도를 제공한다.
   * 닉네임 조회만 실패했을 때는 화면 전체를 막지 않고 상대를 익명으로 그린다.
   */
  const load = useCallback(async () => {
    if (!sessionIdValid) {
      setLoading(false)
      setLoadError('잘못된 세션 주소예요.')
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const [nextItems, nextStatus] = await Promise.all([
        getEvaluationItems(sessionId),
        getEvaluationStatus(sessionId),
      ])
      setItems(nextItems)
      setStatus(nextStatus)

      const nickname = await getPublicProfile(nextItems.partnerUserId)
        .then((profile) => profile.nickname)
        .catch(() => '상대방')
      setOpponent({ userId: nextItems.partnerUserId, nickname })

      // 열람 가능 판정은 서버 몫이다 — 화면에서 숨기는 것으로 잠금을 대신하지 않는다
      setReceived(nextStatus.resultAvailable ? await getReceivedEvaluation(sessionId) : null)

      // 리포트 상태를 함께 읽어 다음 단계를 정한다. 실패해도 평가 화면은 그대로 떠야 하므로
      // 여기서 예외를 삼킨다(없으면 null = '리포트 기능 없음'과 같은 취급).
      setReportStatus(
        await getReportStatus(String(sessionId))
          .then((result) => result?.status ?? null)
          .catch(() => null),
      )
    } catch (fetchError) {
      setLoadError(errorMessageOf(fetchError, '평가 정보를 불러오지 못했어요.'))
    } finally {
      setLoading(false)
    }
  }, [sessionId, sessionIdValid])

  useEffect(() => {
    void load()
  }, [load])

  /** 종료 흐름의 현재 단계. 평가 상태 + 리포트 상태를 한 규칙으로 접는다. */
  const endPhase = resolveSessionEndPhase({ evaluation: status, reportStatus })

  const metrics = items?.items ?? []
  // 6개짜리 배열이라 메모이즈할 이유가 없다(매 렌더 새 배열이면 useMemo 가 오히려 헛돈다).
  const ratedCount = metrics.filter((m) => scores[m.key] != null).length
  const allRated = metrics.length > 0 && ratedCount === metrics.length

  const submitted = Boolean(status?.mySubmitted)
  // 제출 가능 여부는 서버 판정을 그대로 쓴다(미제출 && 마감 전). 마감 초과 판정은 GateCallout 안에서 한다.
  const canEdit = Boolean(status?.submissionOpen)

  async function handleSubmit() {
    if (!items || !status || !allRated || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await submitEvaluation(sessionId, {
        ...(scores as EvaluationScores),
        goodBehaviorText: goodText.trim() || undefined,
        improvementText: improveText.trim() || undefined,
      })
      // 제출 직후 게이트 상태를 서버에서 다시 읽는다 — 통과 판정은 서버 몫이다.
      const next = await getEvaluationStatus(sessionId)
      setStatus(next)
      setReceived(next.resultAvailable ? await getReceivedEvaluation(sessionId) : null)
    } catch (submitError) {
      setError(errorMessageOf(submitError, '제출에 실패했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="mx-auto grid w-full max-w-[1080px] place-items-center px-5 py-20" aria-busy="true">
        <Spinner size={28} />
      </main>
    )
  }

  if (loadError || !items || !status) {
    return (
      <main className="mx-auto w-full max-w-[1080px] px-5 py-10">
        <Stack gap={12}>
          <Callout tone="danger" icon="report">
            {loadError ?? '평가 정보를 불러오지 못했어요.'}
          </Callout>
          {sessionIdValid && (
            <div>
              <Button variant="secondary" onClick={() => void load()}>
                다시 시도
              </Button>
            </div>
          )}
        </Stack>
      </main>
    )
  }

  const opponentName = opponent?.nickname ?? '상대방'

  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-6">

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={opponentName} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h1 className="bt-h1">{opponentName}님과의 대화, 어떠셨나요?</h1>
            <p className="bt-body-sm bt-muted mt-1">
              외모나 조건이 아니라 대화 행동만 평가해요. 익명으로 전달됩니다.
            </p>
          </div>
        </div>
        {/* 회차·진행 시간 배지는 평가 API 계약에 없어서 뺐다. 세션 상세를 붙일 때 되살린다. */}
        {/* TODO: 추후 global header 생기면 신고/차단 기능 더보기로 넣기 */}
        {/* <OverflowMenu
          label="이 세션 관리"
          items={[{ label: '신고 · 차단', danger: true, onSelect: () => setReportOpen(true) }]}
        /> */}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 정량 6항목 */}
        <Card className="flex flex-col lg:flex-1">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="bt-h3">
              정량 평가{' '}
              <span className="bt-caption bt-muted">
                ({metrics[0]?.minScore ?? 1}~{metrics[0]?.maxScore ?? 5}점)
              </span>
            </span>
            {/* 몇 개 남았는지는 제출 버튼까지 내려가서 알 일이 아니다 — 항목 바로 위에 둔다 */}
            {canEdit && (
              <span className="bt-caption bt-muted" role="status" aria-live="polite">
                <span className="bt-numeric">{ratedCount}</span> /{' '}
                <span className="bt-numeric">{metrics.length}</span> 선택함
              </span>
            )}
          </div>
          {canEdit && (
            <Progress
              className="mb-1"
              value={metrics.length ? (ratedCount / metrics.length) * 100 : 0}
              aria-label={`정량 평가 진행 ${ratedCount} / ${metrics.length}`}
            />
          )}
          {metrics.map((m, i) => (
            <MetricRow
              key={m.key}
              metric={m}
              compact={compact}
              last={i === metrics.length - 1}
              value={scores[m.key]}
              disabled={!canEdit}
              onChange={(v) => setScores((prev) => ({ ...prev, [m.key]: v }))}
            />
          ))}
        </Card>

        {/* 우: 서술형 · 열람 안내 · 제출 */}
        <aside className="flex w-full flex-col gap-4 lg:w-[420px]">
          {/* 성격이 같은 두 입력이라 카드 하나로 묶는다 — 카드를 나누면 우측 컬럼만 길어진다 */}
          <Card className="flex flex-col gap-4">
            <div className="bt-h3">
              한마디 <span className="bt-caption bt-muted">(선택)</span>
            </div>
            <FreeTextField
              label="잘했던 행동"
              placeholder="어떤 행동이 좋았는지 적어주세요"
              value={goodText}
              onChange={setGoodText}
              disabled={!canEdit}
              maxLength={items.maxTextLength}
            />
            <FreeTextField
              label="개선하면 좋을 행동"
              placeholder="완곡하게 적어주세요. 욕설은 필터링됩니다"
              value={improveText}
              onChange={setImproveText}
              disabled={!canEdit}
              maxLength={items.maxTextLength}
            />
          </Card>

          <GateCallout status={status} />

          {error && (
            <span className="bt-error" role="alert">
              {error}
            </span>
          )}

          {canEdit ? (
            <>
              <Button
                variant="primary"
                block
                loading={submitting}
                disabled={!allRated}
                onClick={handleSubmit}
              >
                평가 제출
              </Button>
              {!allRated && (
                <p className="bt-caption bt-muted">
                  <span className="bt-numeric">{metrics.length}</span>개 지표를 모두 평가하면 제출할 수
                  있어요. 한마디는 비워두셔도 됩니다.
                </p>
              )}
            </>
          ) : (
            <>
              {submitted && (
                <p className="bt-caption bt-muted">
                  제출한 평가는 익명으로 전달돼 다시 볼 수 없어요.
                </p>
              )}
              {/* 리포트로 넘어갈 수 있는 단계인지 상태 머신에 묻는다.
                  서버에 리포트 기능이 없는데 버튼만 열어두면 눌렀다가 빈 화면을 본다. */}
              {canOpenReport(endPhase) ? (
                <Button
                  variant="primary"
                  block
                  onClick={() => navigate(`/session/${sessionId}/report`)}
                >
                  내 리포트 보기
                </Button>
              ) : (
                <p className="bt-caption bt-muted">{PHASE_NOTICE[endPhase]}</p>
              )}
            </>
          )}
        </aside>
      </div>

      {/* 상대가 남긴 평가 — 양측 제출이 확인됐을 때만 서버가 내려준다 */}
      {received && (
        <Card className="mt-4">
          <div className="bt-h3 mb-3">{opponentName}님이 남긴 평가</div>
          <Stack gap={10}>
            <Cluster gap={8}>
              {metrics.map((m) => (
                <Badge key={m.key} tone="neutral">
                  {m.label} <span className="bt-numeric">{received[m.key as EvaluationItemKey]}</span>
                </Badge>
              ))}
            </Cluster>
            {received.goodBehaviorText && (
              <div>
                <span className="bt-overline">잘했던 행동</span>
                <p className="bt-body-sm mt-1">{received.goodBehaviorText}</p>
              </div>
            )}
            {received.improvementText && (
              <div>
                <span className="bt-overline">개선하면 좋을 행동</span>
                <p className="bt-body-sm mt-1">{received.improvementText}</p>
              </div>
            )}
            <p className="bt-caption bt-muted">
              익명으로 전달된 의견이에요. 사실과 다르거나 불쾌한 내용이면 신고할 수 있어요.
            </p>
          </Stack>
        </Card>
      )}

      {opponent && (
        <ReportBlockDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          sessionId={sessionId}
          opponent={opponent}
        />
      )}
    </main>
  )
}

/**
 * 상대 평가 열람 안내. 제출 전/후·마감 초과에 따라 문구가 갈린다.
 *
 * 내부 용어("상호성 게이트")는 화면에 쓰지 않는다 — 규칙을 그대로 풀어 쓰면 설명이 끝난다.
 */
function GateCallout({ status }: { status: EvaluationStatus }) {
  const deadline = formatDeadline(status.deadlineAt, status.remainingSeconds)

  if (status.resultPermanentlyLocked) {
    return (
      <Callout tone="warning" icon="lock">
        48시간이 지나 평가가 확정됐어요. 상대가 남긴 평가는 더 이상 열리지 않지만, 내 AI 리포트는
        그대로 볼 수 있어요.
      </Callout>
    )
  }
  if (status.mySubmitted) {
    return status.resultAvailable ? (
      <Callout tone="success" icon="check">
        제출 완료. 상대가 남긴 평가가 열렸어요.
      </Callout>
    ) : (
      <Callout tone="success" icon="check">
        제출 완료. 상대가 평가를 제출하면 바로 열려요. 마감은 {deadline}이에요.
      </Callout>
    )
  }
  return (
    <Callout tone="warning" icon="lock">
      내 평가를 제출해야 상대가 남긴 평가를 볼 수 있어요. {deadline}까지 내지 않으면 상대 평가는
      열리지 않고 매칭 후순위가 됩니다.
    </Callout>
  )
}
