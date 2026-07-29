import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, Icon, Segmented, Skeleton, Spinner } from '@/components'
import { getGrowthDashboard, getImprovementKeywords, getMyBadges, getStrengthKeywords } from './api'
import {
  BadgeChips,
  KeywordChips,
  StatTile,
  TemperatureGauge,
  TemperatureTrend,
  TrackLegend,
  TrendPager,
} from './parts'
import { matchesTrack } from './types'
import type { EarnedBadge, GrowthDashboard, GrowthKeyword, GrowthTrack } from './types'

const TRACK_OPTIONS: Array<{ value: GrowthTrack; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'REAL', label: '실사용자' },
  { value: 'AI', label: 'AI 트랙' },
]

/** 한 화면에 그릴 막대 수. 이보다 많아지면 막대가 뭉개져 비교가 불가능해진다. */
const TREND_PAGE_SIZE = 12

/**
 * W-17 성장 대시보드 (`GROWTH-01`, FE-B).
 *
 * 규칙(와이어플로우):
 *  - **AI 트랙은 별도 표기** — 실사용자 세션과 같은 선으로 합치지 않는다(막대 색을 분리).
 *  - 온도는 **우열이 아닌 성장 지표**로 표현한다. 등수·백분위·상대 비교를 넣지 않는다.
 *  - 강점/보완 키워드는 리포트 JSON 집계 결과를 그대로 받아 빈도와 함께 보여준다.
 */
export function GrowthDashboardPage() {
  const navigate = useNavigate()

  const [track, setTrack] = useState<GrowthTrack>('ALL')
  const [dashboard, setDashboard] = useState<GrowthDashboard | null>(null)
  /** 필터를 바꿔 다시 불러오는 중. 이전 데이터를 남겨두되 갱신 중임을 표시한다 */
  const [refreshing, setRefreshing] = useState(false)
  const [strengths, setStrengths] = useState<GrowthKeyword[]>([])
  const [improvements, setImprovements] = useState<GrowthKeyword[]>([])
  const [badges, setBadges] = useState<EarnedBadge[]>([])
  const [trendPage, setTrendPage] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([getStrengthKeywords(), getImprovementKeywords(), getMyBadges()]).then(([s, i, b]) => {
      if (!alive) return
      setStrengths(s)
      setImprovements(i)
      setBadges(b)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    setRefreshing(true)
    getGrowthDashboard(track)
      .then((d) => {
        if (!alive) return
        setDashboard(d)
        setTrendPage(0) // 필터가 바뀌면 가장 최근 구간부터 다시 본다
      })
      .finally(() => {
        if (alive) setRefreshing(false)
      })
    return () => {
      alive = false
    }
  }, [track])

  // 서버가 track 파라미터를 무시하더라도 화면 필터는 동작해야 한다
  const points = useMemo(
    () => (dashboard?.history ?? []).filter((p) => matchesTrack(p, track)),
    [dashboard, track],
  )

  // page 0 = 가장 최근 구간. 뒤에서부터 잘라야 최근이 항상 첫 화면에 온다.
  const pageCount = Math.max(1, Math.ceil(points.length / TREND_PAGE_SIZE))
  const safePage = Math.min(trendPage, pageCount - 1)
  const end = points.length - safePage * TREND_PAGE_SIZE
  const pagePoints = points.slice(Math.max(0, end - TREND_PAGE_SIZE), end)

  if (!dashboard) return <DashboardSkeleton />

  // 세션이 한 번도 없으면 빈 카드 네 장 대신 다음 행동을 제안한다
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

  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-6">
      {/* 헤더 + 트랙 필터 */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bt-h1">성장 대시보드</h1>
          <p className="bt-body-sm bt-muted mt-1">
            누적 <span className="bt-numeric">{dashboard.completedSessionCount}</span>세션 · 실사용자{' '}
            <span className="bt-numeric">{dashboard.realSessionCount}</span> · AI 화상{' '}
            <span className="bt-numeric">{dashboard.aiSessionCount}</span>
          </p>
        </div>
        {/* 단일 선택 탭이라 토글 칩이 아니라 Segmented 를 쓴다(선택 상태가 상호 배타적임이 드러난다) */}
        <Segmented aria-label="트랙 필터" options={TRACK_OPTIONS} value={track} onChange={setTrack} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* 온도 추이 */}
        <Card className="flex flex-col gap-3 lg:flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="bt-h3">사랑의 온도 추이</span>
            <Badge tone={dashboard.recentDelta >= 0 ? 'success' : 'warning'}>
              <Icon name={dashboard.recentDelta >= 0 ? 'arrow-up' : 'arrow-down'} size={12} />
              <span className="bt-numeric">{Math.abs(dashboard.recentDelta).toFixed(1)}</span> 최근
            </Badge>
          </div>

          {refreshing ? (
            // 필터를 바꾸는 동안 옛 막대를 그대로 두면 새 결과로 착각한다
            <div className="grid place-items-center" style={{ height: 132 }} aria-busy="true">
              <Spinner size={24} label="추이를 불러오는 중" />
            </div>
          ) : (
            <TemperatureTrend points={pagePoints} />
          )}

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
          <TrackLegend />
        </Card>

        {/* 현재 온도 · 스탯 */}
        <Card className="flex w-full flex-col gap-3 lg:w-[300px] lg:shrink-0">
          <span className="bt-h3">현재 온도</span>
          <div className="flex items-end gap-1.5">
            <span
              className="bt-numeric"
              style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}
            >
              {dashboard.currentTemperature.toFixed(1)}
            </span>
            <span className="bt-body-sm bt-muted" style={{ paddingBottom: 4 }}>
              °
            </span>
          </div>
          <TemperatureGauge value={dashboard.currentTemperature} />
          <p className="bt-caption bt-muted">
            온도는 등수가 아니라 내 연습이 쌓인 정도예요. 상대에게는 정확한 값이 보이지 않아요.
          </p>
          <div className="mt-auto flex gap-8 pt-2">
            <StatTile value={dashboard.completedSessionCount} label="총 세션" />
            <StatTile value={dashboard.badgeCount} label="뱃지" />
            {/* 노쇼는 0일 때 굳이 전시하지 않는다 — 성장 지표 옆에 상시 벌점을 두면 화면의 성격이 바뀐다 */}
            {dashboard.noShowCount > 0 && <StatTile value={dashboard.noShowCount} label="노쇼" />}
          </div>
        </Card>
      </div>

      {/* 누적 강점 · 보완 · 뱃지 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="bt-h3 mb-3">누적 강점</div>
          <KeywordChips keywords={strengths} tone="success" />
        </Card>
        <Card>
          <div className="bt-h3 mb-3">누적 보완점</div>
          <KeywordChips keywords={improvements} tone="warning" />
        </Card>
        <Card>
          <div className="bt-h3 mb-3">획득 뱃지</div>
          <BadgeChips badges={badges} />
        </Card>
      </div>
    </main>
  )
}

function DashboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-5 py-6" aria-busy="true">
      <Skeleton width={220} height={32} />
      <div className="mt-5 flex flex-col gap-4 lg:flex-row">
        <Card className="lg:flex-1">
          <Skeleton height={180} />
        </Card>
        <Card className="lg:w-[300px]">
          <Skeleton height={180} />
        </Card>
      </div>
    </main>
  )
}
