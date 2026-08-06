import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Cluster, EmptyState, Icon, Skeleton } from '@/components'
import { getAxisDetail, getReportDetail, getReportStatus, requestReportGeneration } from './api'
import {
  AxisDetailPanel,
  EvidenceList,
  FeedbackList,
  MetricStat,
  NotMeasuredNote,
  RadarChart,
  TopicBreakdown,
} from './parts'
import type { MetricView, RadarPoint } from './parts'
import {
  AXIS_UNMEASURED_REASON,
  axisPercent,
  formatRaw,
  measuredAxisCount,
  narrativeItems,
  REPORT_AXIS_LABEL,
  REPORT_AXIS_ORDER,
  REPORT_NOT_CONFIGURED,
  silenceLabel,
  SPEAKING_BALANCE_LABEL,
  speakingBalanceOf,
} from './types'
import type {
  ReportAxisCode,
  ReportAxisDetail,
  ReportMetrics,
  ReportStatus,
  SessionReportDetail,
} from './types'

/* -------------------------------------------------------------------------- */
/*  W-16 · AI 세션 리포트                                                       */
/*                                                                            */
/*  조회는 2단계다 — `status` 로 reportId 를 얻고 그 id 로 상세를 읽는다.        */
/*  **생성은 프론트가 걸지 않는다.** 세션 종료 이벤트가 서버에서 자동으로 건다.  */
/*  POST(재요청)는 FAILED 일 때만 유효하다.                                     */
/* -------------------------------------------------------------------------- */

/** PENDING/GENERATING 동안 상태를 다시 물어보는 주기. */
const POLL_MS = 15_000

export function SessionReportPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()

  const [status, setStatus] = useState<ReportStatus | null>(null)
  const [failureCode, setFailureCode] = useState<string | null>(null)
  const [report, setReport] = useState<SessionReportDetail | null>(null)
  const [retrying, setRetrying] = useState(false)
  const aliveRef = useRef(true)

  /** 서버에 아직 리포트 행이 없는가(404). 생성 실패와 구분해 다른 문구를 쓴다. */
  const [unavailable, setUnavailable] = useState(false)

  /* ── 축 드릴다운 ──
     훅은 아래 이른 반환(로딩·실패 화면)보다 **위**에 있어야 한다. 반환 뒤에 두면
     상태에 따라 훅 개수가 달라져 React 가 순서를 맞추지 못한다. */
  const [selectedAxis, setSelectedAxis] = useState<ReportAxisCode | null>(null)
  const [axisDetail, setAxisDetail] = useState<ReportAxisDetail | null>(null)
  const [axisLoading, setAxisLoading] = useState(false)
  const [axisError, setAxisError] = useState<string | null>(null)

  const selectAxis = useCallback(
    (code: string) => {
      const axisCode = code as ReportAxisCode
      // 같은 축을 다시 누르면 접는다 — 닫기 버튼을 찾아가지 않아도 되게.
      setSelectedAxis((prev) => (prev === axisCode ? null : axisCode))
    },
    [],
  )

  const reportId = report?.reportId ?? null

  useEffect(() => {
    if (selectedAxis == null || reportId == null) {
      setAxisDetail(null)
      setAxisError(null)
      return
    }
    let alive = true
    setAxisLoading(true)
    setAxisError(null)
    setAxisDetail(null)
    getAxisDetail(reportId, selectedAxis)
      .then((detail) => {
        if (!alive) return
        // null 은 404 — 이 축의 드릴다운이 없다는 뜻이지 오류가 아니다.
        if (detail == null) setAxisError('이 축의 상세 근거는 아직 없어요.')
        else setAxisDetail(detail)
      })
      .catch(() => {
        if (alive) setAxisError('근거를 불러오지 못했어요.')
      })
      .finally(() => {
        if (alive) setAxisLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selectedAxis, reportId])

  const load = useCallback(async () => {
    try {
      const s = await getReportStatus(sessionId)
      if (!aliveRef.current) return
      if (s == null) {
        // 아직 생성 요청 자체가 없다 — 만들다 실패한 게 아니다.
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      setStatus(s.status)
      setFailureCode(s.failureCode)
      if (s.status === 'COMPLETED' && s.reportId != null) {
        const detail = await getReportDetail(s.reportId)
        if (aliveRef.current) setReport(detail)
      }
    } catch {
      // 네트워크·5xx — 상태를 세우지 않고 다음 시도에 맡긴다(가짜 완료를 만들지 않는다)
      if (aliveRef.current) setStatus('FAILED')
    }
  }, [sessionId])

  useEffect(() => {
    aliveRef.current = true
    void load()
    return () => {
      aliveRef.current = false
    }
  }, [load])

  // 생성 중에는 주기적으로 다시 확인한다. 완료·실패면 폴링을 멈춘다.
  useEffect(() => {
    if (status !== 'PENDING' && status !== 'GENERATING') return
    const id = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(id)
  }, [status, load])

  async function retry() {
    setRetrying(true)
    try {
      await requestReportGeneration(sessionId)
      setStatus('PENDING')
    } catch {
      /* 상태는 그대로 두고 다음 폴링에 맡긴다 */
    } finally {
      setRetrying(false)
    }
  }

  /**
   * AI 리포트 서버가 붙지 않은 상태. **재시도해도 같은 결과**라 버튼을 주지 않는다.
   * 서버가 `ai.report.base-url` 미설정이면 즉시 이 코드로 FAILED 처리한다.
   */
  const notConfigured = status === 'FAILED' && failureCode === REPORT_NOT_CONFIGURED

  if (unavailable || notConfigured) {
    return (
      <ReportNotice
        icon="sparkle"
        title="AI 리포트는 준비 중이에요"
        text={
          notConfigured
            ? '분석 서버가 아직 연결되지 않았어요. 준비되면 이 세션의 리포트를 만들어 드릴게요.'
            : '이 세션의 리포트가 아직 만들어지지 않았어요. 세션이 끝나면 자동으로 생성돼요.'
        }
        actionLabel="평가 결과 보기"
        onAction={() => navigate(`/session/${sessionId}/review`)}
      />
    )
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
              ? '세션 분석을 시작하는 중이에요. 잠시만 기다려 주세요.'
              : '분석 결과를 정리하는 중이에요. 잠시만 기다려 주세요.'}
          </p>
          <Button variant="ghost" onClick={() => navigate(`/session/${sessionId}/review`)}>
            평가 결과 보기
          </Button>
        </Card>
      </main>
    )
  }

  if (status === 'FAILED' || !report) {
    return (
      <ReportNotice
        icon="wrench"
        title="리포트를 만들지 못했어요"
        text="분석에 문제가 있었어요. 다시 시도하면 저장된 세션 지표로 새로 만들어 드려요."
        actionLabel="다시 시도"
        actionLoading={retrying}
        onAction={() => void retry()}
      />
    )
  }

  const radar = toRadarPoints(report)
  const questionMeasured = Boolean(report.axes.question?.measured)
  const voiceMetrics = toVoiceMetrics(report.metrics, questionMeasured)
  const visionMetrics = toVisionMetrics(report.metrics)
  const strengths = narrativeItems(report.strengths)
  const improvements = narrativeItems(report.improvements)
  const missions = narrativeItems(report.nextMissions)
  const measuredCount = measuredAxisCount(report.axes)
  // 축 키가 하나도 없다 = 분석 POST 가 BE 에 도달하지 못했다는 뜻이다.
  // (일부만 measured=false 인 '측정 부족'과는 원인도 안내 문구도 다르다)
  // `?? {}` 를 붙이지 않는다 — 위 :159 가 이미 report.axes 를 무방비로 읽으므로
  // 여기서만 방어해 봐야 죽은 코드다. BE 계약상 axes 는 최소 {} 로 온다.
  const analysisMissing = Object.keys(report.axes).length === 0

  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bt-h1">세션 리포트</h1>
          <p className="bt-body-sm bt-muted mt-1">
            {report.generatedAt ? `${formatDate(report.generatedAt)} 생성` : '생성 완료'}
            {report.analysisVersion ? ` · 분석 ${report.analysisVersion}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 레이더 */}
        <Card className="flex w-full flex-col gap-3 lg:w-[340px] lg:shrink-0">
          {/* "6축 점수"라고 쓰지 않는다 — 규약 §4. 항상 6개가 다 측정되는 게 아니라
              몇 개가 측정됐는지를 제목에서 바로 밝힌다. */}
          <div>
            <div className="bt-h3">대화 행동 6축 분석</div>
            {/* axes 가 통째로 비면 '측정 부족'이 아니라 지표 수집 자체가 실패한 것이다.
                둘을 같은 문구로 보여주면 사용자는 원래 그런 줄 알고 넘어간다. */}
            {analysisMissing ? (
              <p className="bt-caption bt-muted mt-0.5">
                지표를 불러오지 못했어요. 아래 요약과 피드백은 정상이에요.
              </p>
            ) : (
              <p className="bt-caption bt-muted mt-0.5">
                <span className="bt-numeric">{measuredCount}</span>개 축 측정
                {measuredCount < REPORT_AXIS_ORDER.length && (
                  <>
                    {' · '}
                    <span className="bt-numeric">{REPORT_AXIS_ORDER.length - measuredCount}</span>개 축
                    측정 부족
                  </>
                )}
              </p>
            )}
          </div>
          <RadarChart
            axes={radar}
            analysisMissing={analysisMissing}
            onSelect={selectAxis}
            selected={selectedAxis}
          />
          {selectedAxis && (
            <AxisDetailPanel
              label={REPORT_AXIS_LABEL[selectedAxis]}
              detail={axisDetail}
              loading={axisLoading}
              error={axisError}
              onClose={() => setSelectedAxis(null)}
            />
          )}
          <p className="bt-caption bt-muted">
            점수는 대화 <b className="text-ink">행동</b>에만 붙어요. 매력도나 등수가 아니에요.
          </p>
        </Card>

        {/* 우: 요약 · 지표 · 잘한 점/개선점 · 근거 · 미션 */}
        <div className="flex w-full flex-col gap-4 lg:flex-1">
          {report.summaryText && (
            <Card>
              <div className="bt-h3 mb-2">한 줄 요약</div>
              <p className="bt-body-sm">{report.summaryText}</p>
            </Card>
          )}

          <Card>
            <div className="bt-h3 mb-3">행동 근거</div>
            {voiceMetrics.length > 0 ? (
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                {voiceMetrics.map((m) => (
                  <MetricStat key={m.key} metric={m} />
                ))}
              </div>
            ) : (
              <NotMeasuredNote text="음성 지표가 기록되지 않았어요." />
            )}

            {/* 비전 미측정이면 0 으로 그리지 않고 사유를 적는다 — "한 번도 웃지 않았다"가 아니다 */}
            <div className="mt-4 border-t border-[var(--bt-color-border)] pt-4">
              {report.metrics?.visionMeasured && visionMetrics.length > 0 ? (
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                  {visionMetrics.map((m) => (
                    <MetricStat key={m.key} metric={m} />
                  ))}
                </div>
              ) : (
                <NotMeasuredNote text="표정·시선 분석은 이 세션에서 측정되지 않았어요." />
              )}
            </div>
          </Card>

          <Card>
            <div className="bt-h3 mb-1">무슨 얘기를 했나요</div>
            <p className="bt-caption bt-muted mb-3">
              내가 말한 시간을 주제별로 나눈 값이에요.
            </p>
            <TopicBreakdown
              topics={report.topicBreakdown ?? []}
              analysisMissing={analysisMissing}
            />
          </Card>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Card className="sm:flex-1">
              <div className="bt-h3 mb-2">잘한 점</div>
              <FeedbackList items={strengths} />
            </Card>
            <Card className="sm:flex-1">
              <div className="bt-h3 mb-2">개선점</div>
              <FeedbackList items={improvements} />
            </Card>
          </div>

          {report.evidenceSegments.length > 0 && (
            <Card>
              <div className="bt-h3 mb-3">언제 그랬나요</div>
              <EvidenceList items={report.evidenceSegments} />
            </Card>
          )}

          {/* 리포트는 흐름의 끝이라 여기서 갈 곳을 주지 않으면 브라우저 뒤로가기밖에 없다.
              뒤로 가면 방금 끝난 세션 화면으로 돌아가 혼란스럽다. */}
          {missions.length > 0 && (
            <Card>
              <div className="bt-h3 mb-3">다음 세션 미션</div>
              {/* TagChip 은 브랜드색+링크색이라 누를 수 있는 것처럼 보인다 — 미션은
                  그냥 정보 라벨이라 중립 톤의 정적 칩(.bt-mission-chip)으로 그린다. */}
              <Cluster gap={6}>
                {missions.map((mission, index) => (
                  <span key={`${mission.sourceCode ?? 'mission'}-${index}`} className="bt-mission-chip">
                    {mission.text}
                  </span>
                ))}
              </Cluster>
            </Card>
          )}
        </div>
      </div>

      {/* 마무리 — 리포트는 흐름의 끝이라 갈 곳을 명시한다.
          '홈으로'를 주 동작으로 둔다. 지난 리포트 비교는 그다음에 하는 일이다. */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="primary" size="lg" onClick={() => navigate('/')}>
          홈으로
        </Button>
        <Button variant="secondary" size="lg" onClick={() => navigate('/reports')}>
          지난 리포트 보기
        </Button>
      </div>
    </main>
  )
}

/* ── 응답 → 표시 형태 ───────────────────────────────────── */

/** 축 맵을 고정 순서로 펼친다. 서버가 주지 않은 축도 '측정 안 됨'으로 자리를 지킨다. */
function toRadarPoints(report: SessionReportDetail): RadarPoint[] {
  return REPORT_AXIS_ORDER.map((code) => {
    const axis = report.axes[code]
    return {
      code,
      label: REPORT_AXIS_LABEL[code],
      percent: axisPercent(axis),
      score: axis?.score ?? null,
      measured: Boolean(axis?.measured),
      note: axis?.note ?? null,
      rawText: formatRaw(axis?.raw ?? null, axis?.rawUnit ?? null),
      unmeasuredReason: AXIS_UNMEASURED_REASON[code] ?? null,
    }
  })
}

/**
 * 서버는 원시 수치를 준다 — 표시 문구는 여기서 만든다. 값이 없는 지표는 아예 넣지 않는다.
 *
 * ⚠️ **질문 수는 `question` 축이 측정된 경우에만 낸다.** 규약 §4 가 질문 균형을 미측정으로
 *    두는 이유가 "질문 의도 판별의 신뢰도가 충분하지 않아서"인데, 같은 화면에서 "질문 12회"를
 *    단정하면 앞뒤가 맞지 않는다. 못 믿을 판정으로 센 수를 사실처럼 적는 셈이다.
 */
function toVoiceMetrics(metrics: ReportMetrics | null, questionMeasured: boolean): MetricView[] {
  if (!metrics) return []
  const out: MetricView[] = []
  if (metrics.speakingRatio != null) {
    const balance = speakingBalanceOf(metrics.speakingRatio)
    out.push({
      key: 'speakingRatio',
      label: '발화 비율',
      display: `${Math.round(metrics.speakingRatio * 100)}%`,
      // 65/35 기준(§10). 숫자만 두면 "68% 면 많은 건가"를 사용자가 판단해야 한다.
      badge: balance ? SPEAKING_BALANCE_LABEL[balance] : null,
      badgeTone: balance === 'BALANCED' ? 'neutral' : 'notice',
    })
  }
  if (questionMeasured && metrics.questionCount != null) {
    out.push({ key: 'questionCount', label: '질문', display: `${metrics.questionCount}회` })
  }
  if (metrics.backchannelCount != null) {
    out.push({ key: 'backchannelCount', label: '맞장구', display: `${metrics.backchannelCount}회` })
  }
  if (metrics.interruptionCount != null) {
    out.push({ key: 'interruptionCount', label: '말 끊기', display: `${metrics.interruptionCount}회` })
  }
  if (metrics.longSilenceCount != null) {
    out.push({
      key: 'longSilenceCount',
      // 기준 초는 서버 값에서 읽는다 — 문서에 남은 15초를 베끼면 다시 어긋난다(§10).
      label: silenceLabel(metrics.silenceThresholdMs),
      display: `${metrics.longSilenceCount}회`,
    })
  }
  if (metrics.fillerCount != null) {
    out.push({ key: 'fillerCount', label: '군말', display: `${metrics.fillerCount}회` })
  }
  return out
}

function toVisionMetrics(metrics: ReportMetrics | null): MetricView[] {
  if (!metrics) return []
  const out: MetricView[] = []
  if (metrics.smileEpisodeCount != null) {
    out.push({ key: 'smileEpisodeCount', label: '미소', display: `${metrics.smileEpisodeCount}회` })
  }
  if (metrics.gazeAwayCount != null) {
    out.push({ key: 'gazeAwayCount', label: '시선 이탈', display: `${metrics.gazeAwayCount}회` })
  }
  if (metrics.faceMissingCount != null) {
    out.push({ key: 'faceMissingCount', label: '화면 벗어남', display: `${metrics.faceMissingCount}회` })
  }
  return out
}

/* ── 상태 화면 ──────────────────────────────────────────── */

function ReportNotice({
  icon,
  title,
  text,
  actionLabel,
  actionLoading,
  onAction,
}: {
  icon: 'sparkle' | 'wrench'
  title: string
  text: string
  actionLabel: string
  actionLoading?: boolean
  onAction: () => void
}) {
  return (
    <main className="mx-auto w-full max-w-[560px] px-5 py-16">
      <Card>
        <EmptyState
          icon={<Icon name={icon} size={28} style={{ color: 'var(--bt-color-text-tertiary)' }} />}
          title={title}
          text={text}
          action={
            <Button variant="primary" loading={actionLoading} onClick={onAction}>
              {actionLabel}
            </Button>
          }
        />
      </Card>
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
