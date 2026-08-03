import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Callout, Card, Cluster, EmptyState, Icon, Skeleton } from '@/components'
import { getReportStatus, getSessionReport, requestReportGeneration } from './api'
import { FeedbackList, IssueCard, MetricStat, RadarChart, RadarLegend, TemperatureCard, TopicCloud } from './parts'
import type { ReportStatus, SessionReport } from './types'

/** PENDING/GENERATING 동안 상태를 다시 물어보는 주기. */
const POLL_MS = 15_000


export function SessionReportPage() {
  const { sessionId = 'demo' } = useParams()
  const navigate = useNavigate()

  const [status, setStatus] = useState<ReportStatus | null>(null)
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null)
  const [report, setReport] = useState<SessionReport | null>(null)
  const [retrying, setRetrying] = useState(false)
  const aliveRef = useRef(true)

  const load = useCallback(async () => {
    const s = await getReportStatus(sessionId)
    if (!aliveRef.current) return
    setStatus(s.reportStatus)
    setDeadlineAt(s.peerReviewDeadlineAt ?? null)
    if (s.reportStatus === 'COMPLETED') {
      const r = await getSessionReport(sessionId)
      if (aliveRef.current) setReport(r)
    }
  }, [sessionId])

  useEffect(() => {
    aliveRef.current = true
    load()
    return () => {
      aliveRef.current = false
    }
  }, [load])

  // 생성 중에는 주기적으로 다시 확인한다. 완료·실패면 폴링을 멈춘다.
  useEffect(() => {
    if (status !== 'PENDING' && status !== 'GENERATING') return
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [status, load])

  async function retry() {
    setRetrying(true)
    try {
      await requestReportGeneration(sessionId)
      setStatus('GENERATING')
    } catch {
      /* 상태는 그대로 두고 다음 폴링에 맡긴다 */
    } finally {
      setRetrying(false)
    }
  }

  if (status == null) return <ReportSkeleton />

  if (status === 'PENDING' || status === 'GENERATING') {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-16" aria-busy="true">
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Icon name="sparkle" size={30} style={{ color: 'var(--bt-color-brand)' }} />
          <b className="bt-h3">리포트를 준비하고 있어요</b>
          <p className="bt-body-sm bt-muted">
            {status === 'PENDING'
              ? '상대의 평가를 기다리는 중이에요. 리포트는 평가가 도착하거나 48시간이 지나면 한 번에 만들어져요.'
              : '분석 결과를 정리하는 중이에요. 잠시만 기다려 주세요.'}
          </p>
          {deadlineAt && <p className="bt-caption bt-muted">대기 마감 {formatDateTime(deadlineAt)}</p>}
          <Button variant="ghost" onClick={() => navigate('/growth')}>
            성장 대시보드 보기
          </Button>
        </Card>
      </main>
    )
  }

  if (status === 'FAILED' || !report) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-16">
        <Card>
          <EmptyState
            icon={<Icon name="wrench" size={28} style={{ color: 'var(--bt-color-text-tertiary)' }} />}
            title="리포트를 만들지 못했어요"
            text="분석에 문제가 있었어요. 다시 시도하면 저장된 세션 지표로 새로 만들어 드려요."
            action={
              <Button variant="primary" loading={retrying} onClick={retry}>
                다시 시도
              </Button>
            }
          />
        </Card>
      </main>
    )
  }

  const hasPeer = report.radar.some((a) => a.peerScore != null)
  const temp = report.temperature

  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-6">
      {/* 헤더 */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bt-h1">
            <span className="bt-numeric">{report.sessionRoundNo}</span>회차 세션 리포트
          </h1>
          <p className="bt-body-sm bt-muted mt-1">
            {formatDate(report.sessionAt)} · {report.opponentNickname}님과{' '}
            <span className="bt-numeric">{report.durationMin}</span>분
            {report.themeName ? ` · ${report.themeName} 테마` : ''}
          </p>
        </div>
        <Badge tone={report.peerReviewIncluded ? 'success' : 'neutral'}>
          {report.peerReviewIncluded ? '상대 평가 반영됨' : 'AI 분석만으로 확정'}
        </Badge>
      </div>

      {/* 온도 변화는 이 리포트의 한 줄 결론이다 — 스크롤 맨 아래가 아니라 헤더 바로 아래에 둔다 */}
      {temp && <TemperatureCard temp={temp} className="mb-4" />}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 레이더 */}
        <Card className="flex w-full flex-col gap-3 lg:w-[340px] lg:shrink-0">
          <div className="bt-h3">AI 분석 & 상대 평가</div>
          <RadarChart axes={report.radar} />
          <RadarLegend hasPeer={hasPeer} />
          <p className="bt-caption bt-muted">
            {hasPeer
              ? '두 점수가 다를 때는 상대가 실제로 느낀 쪽을 먼저 보세요.'
              : '상대 평가가 도착하지 않아 AI 분석만으로 확정됐어요. 이후 제출분은 반영되지 않아요.'}
          </p>
        </Card>

        {/* 우: 이슈 · 지표 · 잘한 점/개선점 · 주제 · 미션 */}
        <div className="flex w-full flex-col gap-4 lg:flex-1">
          {report.issues.length > 0 ? (
            report.issues.map((issue) => <IssueCard key={issue.issueId} issue={issue} />)
          ) : (
            // D-14: 이슈 0건이어도 리포트가 비지 않게 긍정 피드백을 기본 포함한다
            <Callout tone="success" icon="check">
              이번 세션에서는 주의가 필요한 표현이 감지되지 않았어요. 아래 행동 지표를 보며 다음 세션
              목표를 잡아보세요.
            </Callout>
          )}

          <Card>
            <div className="bt-h3 mb-3">행동 근거</div>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              {report.metrics.map((m) => (
                <MetricStat key={m.key} metric={m} />
              ))}
            </div>
          </Card>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Card className="sm:flex-1">
              <div className="bt-h3 mb-2">
                잘한 점
              </div>
              <FeedbackList items={report.strengths} />
            </Card>
            <Card className="sm:flex-1">
              <div className="bt-h3 mb-2">
                개선점
              </div>
              <FeedbackList items={report.improvements} />
            </Card>
          </div>

          {report.topics.length > 0 && (
            <Card>
              <div className="bt-h3 mb-3">대화 주제</div>
              <TopicCloud topics={report.topics} />
            </Card>
          )}

          {report.nextMissions.length > 0 && (
            <Card>
              <div className="bt-h3 mb-3">다음 세션 미션</div>
              {/* TagChip 은 브랜드색+링크색이라 누를 수 있는 것처럼 보인다 — 미션은
                  그냥 정보 라벨이라 중립 톤의 정적 칩(.bt-mission-chip)으로 그린다. */}
              <Cluster gap={6}>
                {report.nextMissions.map((m) => (
                  <span key={m.missionId} className="bt-mission-chip">
                    {m.label}
                  </span>
                ))}
              </Cluster>
            </Card>
          )}

        </div>
      </div>
    </main>
  )
}

function ReportSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-6" aria-busy="true">
      <Skeleton width={280} height={32} />
      <div className="mt-5 flex flex-col gap-4 lg:flex-row">
        <Card className="lg:w-[340px]">
          <Skeleton height={220} />
        </Card>
        <div className="flex flex-1 flex-col gap-4">
          <Card>
            <Skeleton height={80} />
          </Card>
          <Card>
            <Skeleton height={64} />
          </Card>
        </div>
      </div>
    </main>
  )
}

/**
 * 리포트는 확정 문서라 상대 시간("3일 전") 표기를 쓰지 않는다.
 * 화면 안에서 날짜 표기가 갈리지 않도록 **한 곳에서 로케일 포매터로만** 만든다.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { dateStyle: 'long' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })
}
