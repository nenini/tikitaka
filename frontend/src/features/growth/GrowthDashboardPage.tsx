import { useEffect, useMemo, useState } from 'react'
import { Badge, Card, Chip, Spinner } from '@/components'
import { getGrowthDashboard, getImprovementKeywords, getMyBadges, getStrengthKeywords } from './api'
import {
  BadgeChips,
  KeywordChips,
  StatTile,
  TemperatureGauge,
  TemperatureTrend,
  TrackLegend,
} from './parts'
import { matchesTrack } from './types'
import type { EarnedBadge, GrowthDashboard, GrowthKeyword, GrowthTrack } from './types'

const TRACK_FILTERS: Array<{ value: GrowthTrack; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'REAL', label: '실사용자' },
  { value: 'AI', label: 'AI 트랙' },
]

/**
 * W-17 성장 대시보드 (`GROWTH-01`, FE-B).
 *
 * 규칙(와이어플로우):
 *  - **AI 트랙은 별도 표기** — 실사용자 세션과 같은 선으로 합치지 않는다(막대 색을 분리).
 *  - 온도는 **우열이 아닌 성장 지표**로 표현한다. 등수·백분위·상대 비교를 넣지 않는다.
 *  - 강점/보완 키워드는 리포트 JSON 집계 결과를 그대로 받아 빈도와 함께 보여준다.
 */
export function GrowthDashboardPage() {
  const [track, setTrack] = useState<GrowthTrack>('ALL')
  const [dashboard, setDashboard] = useState<GrowthDashboard | null>(null)
  const [strengths, setStrengths] = useState<GrowthKeyword[]>([])
  const [improvements, setImprovements] = useState<GrowthKeyword[]>([])
  const [badges, setBadges] = useState<EarnedBadge[]>([])

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
    getGrowthDashboard(track).then((d) => alive && setDashboard(d))
    return () => {
      alive = false
    }
  }, [track])

  // 서버가 track 파라미터를 무시하더라도 화면 필터는 동작해야 한다
  const points = useMemo(
    () => (dashboard?.history ?? []).filter((p) => matchesTrack(p, track)),
    [dashboard, track],
  )

  if (!dashboard) {
    return (
      <main className="mx-auto grid w-full max-w-[1080px] place-items-center px-5 py-20" aria-busy="true">
        <Spinner size={28} />
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
        <div className="flex gap-1.5" role="group" aria-label="트랙 필터">
          {TRACK_FILTERS.map((f) => (
            <Chip
              key={f.value}
              selected={track === f.value}
              onSelectedChange={() => setTrack(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* 온도 추이 */}
        <Card className="flex flex-col gap-3 lg:flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="bt-h3">사랑의 온도 추이</span>
            <Badge tone={dashboard.recentDelta >= 0 ? 'success' : 'warning'}>
              {dashboard.recentDelta >= 0 ? '▲' : '▼'}{' '}
              <span className="bt-numeric">{Math.abs(dashboard.recentDelta).toFixed(1)}</span> 최근
            </Badge>
          </div>
          <TemperatureTrend points={points} />
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
            온도는 등수가 아니라 <b>내 연습이 쌓인 정도</b>예요. 상대에게는 정확한 값이 보이지 않아요.
          </p>
          <div className="mt-auto flex gap-8 pt-2">
            <StatTile value={dashboard.completedSessionCount} label="총 세션" />
            <StatTile value={dashboard.noShowCount} label="노쇼" />
            <StatTile value={dashboard.badgeCount} label="뱃지" />
          </div>
        </Card>
      </div>

      {/* 누적 강점 · 보완 · 뱃지 */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        <Card className="lg:flex-1">
          <div className="bt-h3 mb-3">누적 강점</div>
          <KeywordChips keywords={strengths} tone="success" />
        </Card>
        <Card className="lg:flex-1">
          <div className="bt-h3 mb-3">누적 보완점</div>
          <KeywordChips keywords={improvements} tone="warning" />
        </Card>
        <Card className="lg:flex-1">
          <div className="bt-h3 mb-3">획득 뱃지</div>
          <BadgeChips badges={badges} />
        </Card>
      </div>
    </main>
  )
}
