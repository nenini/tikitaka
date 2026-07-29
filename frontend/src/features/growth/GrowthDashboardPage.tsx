import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, Icon, Skeleton } from '@/components'
import { getGrowthDashboard, getImprovementKeywords, getMyBadges, getStrengthKeywords } from './api'
import {
  BadgeGrid,
  GrowthPanel,
  InlineStats,
  KeywordChips,
  TemperatureTrend,
  TrendPager,
} from './parts'
import type { EarnedBadge, GrowthDashboard, GrowthKeyword } from './types'

/** 한 화면에 그릴 점의 수. 이보다 많아지면 점이 붙어 흐름이 읽히지 않는다. */
const TREND_PAGE_SIZE = 12

/**
 * W-17 성장 대시보드 (`GROWTH-01`, FE-B).
 *
 * 규칙(와이어플로우):
 *  - 온도는 **우열이 아닌 성장 지표**로 표현한다. 등수·백분위·상대 비교를 넣지 않는다.
 *  - 강점/보완 키워드는 리포트 JSON 집계 결과를 그대로 받아 빈도와 함께 보여준다.
 *
 * 구성: 온도와 추이를 **하나의 히어로 면**에 모으고, 그 아래에 패턴·뱃지 두 장만 둔다.
 * 같은 크기의 카드를 여러 장 늘어놓으면 전부 같은 목소리로 말해서 무엇을 먼저 볼지가 사라진다.
 * 추이 그래프는 트랙을 나누지 않고 전체 흐름 하나로 그린다 — 실사용자/AI 세션 수는
 * 히어로의 스탯 줄에서 따로 세어 보여준다.
 */
export function GrowthDashboardPage() {
  const navigate = useNavigate()

  const [dashboard, setDashboard] = useState<GrowthDashboard | null>(null)
  const [strengths, setStrengths] = useState<GrowthKeyword[]>([])
  const [improvements, setImprovements] = useState<GrowthKeyword[]>([])
  const [badges, setBadges] = useState<EarnedBadge[]>([])
  const [trendPage, setTrendPage] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([
      getGrowthDashboard(),
      getStrengthKeywords(),
      getImprovementKeywords(),
      getMyBadges(),
    ]).then(([d, s, i, b]) => {
      if (!alive) return
      setDashboard(d)
      setStrengths(s)
      setImprovements(i)
      setBadges(b)
    })
    return () => {
      alive = false
    }
  }, [])

  const points = dashboard?.history ?? []

  // page 0 = 가장 최근 구간. 뒤에서부터 잘라야 최근이 항상 첫 화면에 온다.
  const pageCount = Math.max(1, Math.ceil(points.length / TREND_PAGE_SIZE))
  const safePage = Math.min(trendPage, pageCount - 1)
  const end = points.length - safePage * TREND_PAGE_SIZE
  const pagePoints = points.slice(Math.max(0, end - TREND_PAGE_SIZE), end)

  if (!dashboard) return <DashboardSkeleton />


  // 세션이 한 번도 없으면 빈 카드 여러 장 대신 다음 행동을 제안한다
  if (dashboard.completedSessionCount === 0) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-16">
        <Card>
          <EmptyState
            icon={<Icon name="chart" size={28} style={{ color: 'var(--bt-color-text-tertiary)' }} />}
            title="아직 보여드릴 기록이 없어요"
            text="첫 세션을 마치면 사랑의 온도 추이와 반복되는 강점·보완점을 여기에 모아 드려요."
            action={
              <Button variant="primary" onClick={() => navigate('/matching')}>
                연습 시작하기
              </Button>
            }
          />
        </Card>
      </main>
    )
  }

  const up = dashboard.recentDelta >= 0

  const stats = [
    { value: dashboard.completedSessionCount, label: '완료한 세션' },
    { value: dashboard.realSessionCount, label: '실사용자' },
    { value: dashboard.aiSessionCount, label: 'AI 연습' },
    { value: dashboard.badgeCount, label: '뱃지' },
    // 노쇼는 0일 때 굳이 전시하지 않는다 — 성장 지표 옆에 상시 벌점을 두면 화면의 성격이 바뀐다
    ...(dashboard.noShowCount > 0 ? [{ value: dashboard.noShowCount, label: '노쇼' }] : []),
  ]

  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bt-h1">성장 대시보드</h1>
          <p className="bt-body-sm bt-muted mt-1">연습이 쌓이면서 무엇이 달라졌는지 모아 봤어요.</p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/matching')}>
          연습 시작하기
        </Button>
      </header>

      {/* ── 히어로: 온도 + 추이 ── */}
      <section className="bt-hero">
        <div className="bt-hero__body flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
          <div>
            <span className="bt-overline">사랑의 온도</span>
            <div className="mt-2 flex items-end gap-3">
              <span className="bt-temp-display">
                {dashboard.currentTemperature.toFixed(1)}
                <span className="bt-temp-display__unit">°</span>
              </span>
              <span className={`bt-delta ${up ? 'bt-delta--up' : 'bt-delta--down'} mb-2`}>
                <Icon name={up ? 'arrow-up' : 'arrow-down'} size={15} />
                {Math.abs(dashboard.recentDelta).toFixed(1)}
                <span className="bt-caption bt-muted ml-0.5">지난 세션 대비</span>
              </span>
            </div>
            <p className="bt-caption bt-muted mt-2 ">
              내 연습이 쌓인 정도예요. 상대에게는 정확한 값이 보이지 않아요.
            </p>
          </div>

          <InlineStats items={stats} />
        </div>

        <div className="px-6 sm:px-8">
          <TemperatureTrend points={pagePoints} />
        </div>

        {pageCount > 1 && (
          <div className="px-6 pb-4 sm:px-8">
            <TrendPager
              page={safePage}
              pageCount={pageCount}
              rangeLabel={
                pagePoints.length > 0
                  ? `${pagePoints[0].sessionNo}~${pagePoints[pagePoints.length - 1].sessionNo}회차`
                  : '기록 없음'
              }
              onChange={setTrendPage}
            />
          </div>
        )}
      </section>

      <div className="bt-growth-grid mt-5">
        <GrowthPanel
          tone="brand"
          title="반복되는 패턴"
          meta="지난 리포트 집계"
          mark="petal"
          className="bt-growth-grid__pattern"
        >
          <div className="flex flex-col gap-5">
            <div>
              <div className="bt-overline mb-3" style={{ color: 'var(--bt-color-success)' }}>
                강점
              </div>
              <KeywordChips keywords={strengths} tone="success" />
            </div>
            <div>
              <div className="bt-overline mb-3" style={{ color: 'var(--bt-color-warning)' }}>
                보완점
              </div>
              <KeywordChips keywords={improvements} tone="warning" />
            </div>
          </div>
        </GrowthPanel>

        <Card className="bt-growth-grid__badges flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="bt-h3">획득 뱃지</span>
            <span className="bt-caption bt-muted bt-numeric">{dashboard.badgeCount}</span>
          </div>
          <BadgeGrid badges={badges} />
        </Card>
      </div>
    </main>
  )
}

const panelSkeleton = { borderRadius: 'var(--bt-radius-xl)' } as const

function DashboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-8" aria-busy="true">
      <Skeleton width={220} height={32} />
      <Skeleton
        height={380}
        className="mt-5"
        style={{ borderRadius: 'var(--bt-radius-2xl)' }}
      />
      {/* 로드 후 실제 배치와 같은 자리를 잡아 둔다 — 골격이 다르면 데이터가 도착할 때 화면이 튄다 */}
      <div className="bt-growth-grid mt-5">
        <Skeleton height={260} className="bt-growth-grid__pattern" style={panelSkeleton} />
        <Skeleton height={260} className="bt-growth-grid__badges" style={panelSkeleton} />
      </div>
    </main>
  )
}
