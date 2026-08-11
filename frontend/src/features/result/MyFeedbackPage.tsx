import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Callout, Card, Cluster, Icon, Spinner, Stack } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getPublicProfile } from '@/features/profile/api'
import { getReportStatus } from '@/features/report/api'
import type { ReportStatus } from '@/features/report/types'
import { getEvaluationItems, getEvaluationStatus, getReceivedEvaluation } from './api'
import { ScoreReadout } from './parts'
import { canOpenReport, PHASE_NOTICE, resolveSessionEndPhase } from './sessionEndFlow'
import { formatDeadline } from './format'
import type {
  EvaluationItemDef,
  EvaluationItemKey,
  EvaluationStatus,
  ReceivedEvaluation,
} from './types'

/* -------------------------------------------------------------------------- */
/*  내 피드백 (`/session/:sessionId/feedback`)                                  */
/*                                                                            */
/*  세션 종료 흐름의 **두 번째** 화면이다.                                       */
/*    ① /review   상대에 대한 평가를 남긴다 (설문)                              */
/*    ② /feedback 내가 받은 평가를 읽는다  ← 여기                               */
/*    ③ /report   AI 리포트                                                    */
/*                                                                            */
/*  예전에는 ①과 ②가 한 화면에 있었다. 설문을 채우는 동안 아래쪽에 "상대가 남긴  */
/*  평가"가 함께 놓여, **남의 평가를 보면서 내 평가를 쓰는** 모양이 됐다.        */
/*  받은 피드백은 읽고 곱씹는 화면이지 입력 화면이 아니라 성격도 다르다.         */
/* -------------------------------------------------------------------------- */

export function MyFeedbackPage() {
  const { sessionId: sessionIdParam } = useParams()
  const navigate = useNavigate()

  const sessionId = Number(sessionIdParam)
  const sessionIdValid = Number.isInteger(sessionId) && sessionId > 0

  const [status, setStatus] = useState<EvaluationStatus | null>(null)
  const [metrics, setMetrics] = useState<EvaluationItemDef[]>([])
  const [received, setReceived] = useState<ReceivedEvaluation | null>(null)
  const [opponentName, setOpponentName] = useState('상대방')
  const [reportStatus, setReportStatus] = useState<ReportStatus | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
      setMetrics(nextItems.items)
      setStatus(nextStatus)

      setOpponentName(
        await getPublicProfile(nextItems.partnerUserId)
          .then((profile) => profile.nickname)
          .catch(() => '상대방'),
      )

      // 열람 가능 판정은 서버 몫이다 — 화면에서 숨기는 것으로 잠금을 대신하지 않는다.
      setReceived(nextStatus.resultAvailable ? await getReceivedEvaluation(sessionId) : null)

      setReportStatus(
        await getReportStatus(String(sessionId))
          .then((result) => result?.status ?? null)
          .catch(() => null),
      )
    } catch (fetchError) {
      setLoadError(errorMessageOf(fetchError, '피드백을 불러오지 못했어요.'))
    } finally {
      setLoading(false)
    }
  }, [sessionId, sessionIdValid])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <main className="mx-auto grid w-full max-w-[720px] place-items-center px-5 py-20" aria-busy="true">
        <Spinner size={28} />
      </main>
    )
  }

  if (loadError || !status) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-5 py-10">
        <Stack gap={12}>
          <Callout tone="danger" icon="report">
            {loadError ?? '피드백을 불러오지 못했어요.'}
          </Callout>
          {sessionIdValid && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void load()}>
                다시 시도
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                홈으로
              </Button>
            </div>
          )}
        </Stack>
      </main>
    )
  }

  const endPhase = resolveSessionEndPhase({ evaluation: status, reportStatus })

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-6">
      <header className="mb-5">
        <h1 className="bt-h1">내가 받은 피드백</h1>
        <p className="bt-body-sm bt-muted mt-1">
          {opponentName}님이 익명으로 남긴 의견이에요. 대화 행동에 대한 평가만 담겨 있어요.
        </p>
      </header>

      {received ? (
        <Card>
          <Stack gap={14}>
            {/* 낼 때와 같은 언어로 보여준다 — 하트로 매겼는데 숫자로 받으면 두 화면이 갈린다 */}
            <div>
              {metrics.map((m, i) => (
                <ScoreReadout
                  key={m.key}
                  label={m.label}
                  score={received[m.key as EvaluationItemKey]}
                  max={m.maxScore}
                  last={i === metrics.length - 1}
                />
              ))}
            </div>

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
            {!received.goodBehaviorText && !received.improvementText && (
              <p className="bt-body-sm bt-muted">서술형 의견은 남기지 않았어요.</p>
            )}

            <p className="bt-caption bt-muted">
              익명으로 전달된 의견이에요. 사실과 다르거나 불쾌한 내용이면 신고할 수 있어요.
            </p>
          </Stack>
        </Card>
      ) : (
        <PendingCard status={status} onRetry={() => void load()} />
      )}

      {/* 다음 단계 — 리포트. 갈 수 없는 단계면 이유를 적는다(빈 화면으로 보내지 않는다). */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {canOpenReport(endPhase) ? (
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(`/session/${sessionId}/report`)}
          >
            내 AI 리포트 보기
          </Button>
        ) : (
          <p className="bt-caption bt-muted self-center">{PHASE_NOTICE[endPhase]}</p>
        )}
        <Button variant="secondary" size="lg" onClick={() => navigate('/')}>
          홈으로
        </Button>
      </div>
    </main>
  )
}

/**
 * 아직 받은 평가가 없을 때. **왜 없는지에 따라 할 일이 다르다** —
 * 기다리면 되는 상태와 영영 못 보는 상태를 같은 문구로 뭉뚱그리지 않는다.
 */
function PendingCard({ status, onRetry }: { status: EvaluationStatus; onRetry: () => void }) {
  if (status.resultPermanentlyLocked) {
    return (
      <Card>
        <Stack gap={10}>
          <Cluster gap={8} style={{ alignItems: 'center' }}>
            <Icon name="lock" size={18} style={{ color: 'var(--bt-color-text-tertiary)' }} />
            <b className="bt-h3">피드백이 열리지 않았어요</b>
          </Cluster>
          <p className="bt-body-sm bt-muted">
            48시간이 지나 평가가 확정됐어요. 상대가 남긴 평가는 더 이상 열리지 않지만, 내 AI
            리포트는 그대로 볼 수 있어요.
          </p>
        </Stack>
      </Card>
    )
  }

  if (!status.mySubmitted) {
    return (
      <Card>
        <Stack gap={10}>
          <Cluster gap={8} style={{ alignItems: 'center' }}>
            <Icon name="lock" size={18} style={{ color: 'var(--bt-color-text-tertiary)' }} />
            <b className="bt-h3">내 평가를 먼저 남겨주세요</b>
          </Cluster>
          <p className="bt-body-sm bt-muted">
            내가 평가를 제출해야 상대가 남긴 평가가 열려요.{' '}
            {formatDeadline(status.deadlineAt, status.remainingSeconds)}까지 내지 않으면 열리지
            않고 매칭 후순위가 됩니다.
          </p>
        </Stack>
      </Card>
    )
  }

  return (
    <Card>
      <Stack gap={10}>
        <Cluster gap={8} style={{ alignItems: 'center' }}>
          <Icon name="clock" size={18} style={{ color: 'var(--bt-color-text-tertiary)' }} />
          <b className="bt-h3">상대의 평가를 기다리고 있어요</b>
        </Cluster>
        <p className="bt-body-sm bt-muted">
          내 평가는 전달됐어요. 상대가 제출하면 바로 열려요. 마감은{' '}
          {formatDeadline(status.deadlineAt, status.remainingSeconds)}이에요.
        </p>
        <div>
          <Button variant="secondary" size="sm" leadingIcon="refresh" onClick={onRetry}>
            새로고침
          </Button>
        </div>
      </Stack>
    </Card>
  )
}
