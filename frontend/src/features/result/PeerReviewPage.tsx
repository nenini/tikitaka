import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Callout, Card, Cluster, Spinner, Stack } from '@/components'
import { useIsCompactViewport } from '@/shared/lib/useIsCompactViewport'
import {
  getPeerReviewForm,
  getReceivedReview,
  getReceivedStatus,
  getSubmittedReview,
  submitPeerReview,
} from './api'
import { FreeTextField, MetricRow, ReportBlockDialog } from './parts'
import { formatDeadline } from './format'
import type {
  PeerReviewForm,
  PeerReviewMetricKey,
  PeerReviewScores,
  ReceivedReview,
  ReceivedReviewStatus,
} from './types'

/**
 * W-14 상호 평가 (`RESULT-02`, FE-B).
 *
 * 규칙(와이어플로우):
 *  - 외모·조건이 아닌 **대화 행동만** 평가한다. 익명 전달 · 욕설은 서버에서 필터링.
 *  - 서술형 2종은 **선택** — 필수 입력으로 만들지 않는다.
 *  - 🔒 상호성 게이트: 내 평가를 제출해야 상대 평가를 열람할 수 있다. 판정은 **서버**가 한다
 *    (여기서는 status.unlocked 를 신뢰만 하고, 화면 숨김을 잠금 대용으로 쓰지 않는다).
 *  - 48시간 내 미제출이면 상대 평가는 영구히 열리지 않고 매칭 후순위가 된다(D-12).
 *    다만 **영구 잠금이 아니다** — 내 AI 리포트(W-16)는 제출 여부와 무관하게 열람 가능하다.
 */
export function PeerReviewPage() {
  const { sessionId = 'demo' } = useParams()
  const navigate = useNavigate()
  const compact = useIsCompactViewport()

  const [form, setForm] = useState<PeerReviewForm | null>(null)
  const [status, setStatus] = useState<ReceivedReviewStatus | null>(null)
  const [received, setReceived] = useState<ReceivedReview | null>(null)

  const [scores, setScores] = useState<PeerReviewScores>({})
  const [goodText, setGoodText] = useState('')
  const [improveText, setImproveText] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getPeerReviewForm(sessionId), getReceivedStatus(sessionId)]).then(([f, s]) => {
      if (!alive) return
      setForm(f)
      setStatus(s)
      if (s.unlocked) getReceivedReview(sessionId).then((r) => alive && setReceived(r))
      // 이미 제출한 뒤 다시 들어온 경우 — 빈 폼이 아니라 내가 낸 평가를 읽기 전용으로 되살린다
      if (f.submitted || s.mySubmitted) {
        getSubmittedReview(sessionId).then((mine) => {
          if (!alive || !mine) return
          setScores(mine.scores)
          setGoodText(mine.goodBehaviorText ?? '')
          setImproveText(mine.improvementText ?? '')
        })
      }
    })
    return () => {
      alive = false
    }
  }, [sessionId])

  const metrics = form?.metrics ?? []
  // 6개짜리 배열이라 메모이즈할 이유가 없다(매 렌더 새 배열이면 useMemo 가 오히려 헛돈다).
  const allRated = metrics.length > 0 && metrics.every((m) => scores[m.key] != null)

  const submitted = Boolean(form?.submitted || status?.mySubmitted)
  const expired = Boolean(status?.expired)

  async function handleSubmit() {
    if (!form || !allRated || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await submitPeerReview(sessionId, {
        scores: scores as Record<PeerReviewMetricKey, number>,
        goodBehaviorText: goodText.trim() || undefined,
        improvementText: improveText.trim() || undefined,
      })
      // 제출 직후 게이트 상태를 서버에서 다시 읽는다 — 통과 판정은 서버 몫이다.
      const next = await getReceivedStatus(sessionId)
      setStatus(next)
      setForm({ ...form, submitted: true })
      if (next.unlocked) setReceived(await getReceivedReview(sessionId))
    } catch {
      setError('제출에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!form || !status) {
    return (
      <main className="mx-auto grid w-full max-w-[1080px] place-items-center px-5 py-20" aria-busy="true">
        <Spinner size={28} />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-6">
      {/* 헤더 */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bt-h1">{form.opponent.nickname}님과의 대화, 어떠셨나요?</h1>
          <p className="bt-body-sm bt-muted mt-1">
            외모·조건이 아니라 <b>대화 행동만</b> 평가해요. 익명으로 전달됩니다.
          </p>
        </div>
        <Badge tone="warning">
          <span className="bt-numeric">{form.sessionRoundNo}</span>회차 ·{' '}
          <span className="bt-numeric">{form.durationMin}</span>분 완료
        </Badge>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 정량 6항목 */}
        <Card className="flex flex-col lg:flex-1">
          <div className="bt-h3 mb-1">
            정량 평가 <span className="bt-caption bt-muted">(1~5점)</span>
          </div>
          {metrics.map((m) => (
            <MetricRow
              key={m.key}
              metric={m}
              compact={compact}
              value={scores[m.key]}
              disabled={submitted || expired}
              onChange={(v) => setScores((prev) => ({ ...prev, [m.key]: v }))}
            />
          ))}
        </Card>

        {/* 우: 서술형 · 게이트 안내 · 제출 */}
        <aside className="flex w-full flex-col gap-4 lg:w-[420px]">
          <Card>
            <FreeTextField
              label="잘했던 행동"
              placeholder="어떤 행동이 좋았는지 적어주세요"
              value={goodText}
              onChange={setGoodText}
              disabled={submitted || expired}
            />
          </Card>
          <Card>
            <FreeTextField
              label="개선하면 좋을 행동"
              placeholder="완곡하게 적어주세요 · 욕설은 필터링됩니다"
              value={improveText}
              onChange={setImproveText}
              disabled={submitted || expired}
            />
          </Card>

          <GateCallout status={status} submitted={submitted} />

          {error && (
            <span className="bt-error" role="alert">
              {error}
            </span>
          )}

          {!submitted && !expired && (
            <div className="flex gap-2">
              <Button variant="ghost" leadingIcon="report" onClick={() => setReportOpen(true)}>
                신고 · 차단
              </Button>
              <Button
                variant="primary"
                style={{ flex: 2 }}
                loading={submitting}
                disabled={!allRated}
                onClick={handleSubmit}
              >
                평가 제출
              </Button>
            </div>
          )}

          {!submitted && !expired && !allRated && (
            <p className="bt-caption bt-muted">
              정량 6항목을 모두 선택하면 제출할 수 있어요. 서술형은 비워두셔도 됩니다.
            </p>
          )}

          {(submitted || expired) && (
            <div className="flex gap-2">
              <Button variant="ghost" leadingIcon="report" onClick={() => setReportOpen(true)}>
                신고 · 차단
              </Button>
              <Button
                variant="primary"
                style={{ flex: 2 }}
                onClick={() => navigate(`/session/${sessionId}/report`)}
              >
                내 리포트 보기
              </Button>
            </div>
          )}
        </aside>
      </div>

      {/* 상대가 남긴 평가 — 게이트를 통과했을 때만 서버가 내려준다 */}
      {received && (
        <Card className="mt-4">
          <div className="bt-h3 mb-3">{form.opponent.nickname}님이 남긴 평가</div>
          <Stack gap={10}>
            <Cluster gap={8}>
              {metrics.map((m) => (
                <Badge key={m.key} tone="neutral">
                  {m.label} <span className="bt-numeric">{received.scores[m.key]}</span>
                </Badge>
              ))}
            </Cluster>
            {received.goodBehaviorText && (
              <p className="bt-body-sm">
                <b>잘했던 행동</b> — {received.goodBehaviorText}
              </p>
            )}
            {received.improvementText && (
              <p className="bt-body-sm">
                <b>개선하면 좋을 행동</b> — {received.improvementText}
              </p>
            )}
            <p className="bt-caption bt-muted">
              익명으로 전달된 의견이에요. 사실과 다르거나 불쾌한 내용이면 신고할 수 있어요.
            </p>
          </Stack>
        </Card>
      )}

      <ReportBlockDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        sessionId={sessionId}
        opponent={form.opponent}
      />
    </main>
  )
}

/** 상호성 게이트 안내. 제출 전/후 · 마감 초과에 따라 문구가 갈린다. */
function GateCallout({ status, submitted }: { status: ReceivedReviewStatus; submitted: boolean }) {
  if (status.expired) {
    return (
      <Callout tone="warning" icon="lock">
        <b>48시간이 지나 평가가 확정됐어요.</b> 상대가 남긴 평가는 더 이상 열리지 않지만,
        <b> 내 AI 리포트는 그대로 볼 수 있어요.</b>
      </Callout>
    )
  }
  if (submitted) {
    return status.unlocked ? (
      <Callout tone="success" icon="check">
        제출 완료 — 상대가 남긴 평가가 열렸어요.
      </Callout>
    ) : (
      <Callout tone="success" icon="check">
        제출 완료 — 상대가 평가를 제출하면 바로 열려요. 마감은 {formatDeadline(status.deadlineAt)}이에요.
      </Callout>
    )
  }
  return (
    <Callout tone="warning" icon="lock">
      <b>상호성 게이트</b> — 내 평가를 제출해야 상대가 남긴 평가를 볼 수 있어요.
      <b> {formatDeadline(status.deadlineAt)}까지 미제출</b> 시 상대 평가는 영구히 열리지 않고 매칭
      후순위가 됩니다.
    </Callout>
  )
}
