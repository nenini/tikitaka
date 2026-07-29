import { Badge, TagChip, VisuallyHidden } from '@/components'
import { TEMPERATURE_MAX } from './types'
import type { EarnedBadge, GrowthKeyword, TemperaturePoint } from './types'

/** 트랙별 색. AI 트랙은 실사용자와 **다른 색으로 별도 표기**한다(합치지 않는다). */
export const TRACK_COLOR = {
  REAL: 'var(--bt-color-action)',
  AI: 'var(--bt-blue-300)',
} as const

export function trackOf(point: TemperaturePoint): keyof typeof TRACK_COLOR {
  return point.sessionType === 'REAL' ? 'REAL' : 'AI'
}

/* ── 온도 추이 ──────────────────────────────────────────── */

/**
 * 세션별 온도 추이 막대 (`GROWTH-01`).
 *
 * ⚠️ 임의 구현: y축을 0부터 그리면 30~38 구간의 변화가 거의 안 보여서
 *    **데이터 범위(최소−1 ~ 최대+1)로 축을 잡았다.** 대신 축 하한/상한을 라벨로 노출해
 *    "막대 길이 = 절대 온도"로 오독되지 않게 했다.
 */
export function TemperatureTrend({ points }: { points: TemperaturePoint[] }) {
  if (points.length === 0) {
    return <p className="bt-body-sm bt-muted">아직 기록된 세션이 없어요.</p>
  }

  const values = points.map((p) => p.temperatureAfter)
  const floor = Math.floor(Math.min(...values) - 1)
  const ceil = Math.ceil(Math.max(...values) + 1)
  const span = Math.max(1, ceil - floor)

  return (
    <div>
      <div
        className="flex items-end gap-1.5"
        style={{ height: 132 }}
        role="img"
        aria-label={`세션별 사랑의 온도 추이. ${points.length}회 기록, 최근 ${values[values.length - 1].toFixed(1)}도`}
      >
        {points.map((p) => {
          const ratio = (p.temperatureAfter - floor) / span
          return (
            <div key={p.sessionId} className="flex flex-1 flex-col items-center gap-1">
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(6, ratio * 100)}%`,
                  borderRadius: '6px 6px 0 0',
                  background: TRACK_COLOR[trackOf(p)],
                }}
              />
              <span className="bt-caption bt-muted bt-numeric">{p.sessionNo}</span>
            </div>
          )
        })}
      </div>

      <div className="bt-caption bt-muted mt-1 flex justify-between">
        <span>
          축 <span className="bt-numeric">{floor}</span>°~<span className="bt-numeric">{ceil}</span>°
        </span>
        <span>세션 회차</span>
      </div>

      <VisuallyHidden>
        <ul>
          {points.map((p) => (
            <li key={p.sessionId}>
              {p.sessionNo}회차 ({trackOf(p) === 'REAL' ? '실사용자' : 'AI 트랙'}):{' '}
              {p.temperatureAfter.toFixed(1)}도
            </li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  )
}

export function TrackLegend() {
  return (
    <div className="flex flex-wrap gap-4">
      <LegendDot color={TRACK_COLOR.REAL} label="실사용자" />
      <LegendDot color={TRACK_COLOR.AI} label="AI 트랙 (별도 표기)" />
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="bt-caption flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  )
}

/* ── 현재 온도 ──────────────────────────────────────────── */

/**
 * 현재 온도 게이지. 목업의 warm 그라디언트(파랑→로즈)를 그대로 쓴다 —
 * 디자인 시스템의 `.bt-progress` 는 채움색이 brand 로 고정이라 온도 게이지만 별도로 그린다.
 */
export function TemperatureGauge({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, (value / TEMPERATURE_MAX) * 100))
  return (
    <div
      style={{
        height: 8,
        borderRadius: 999,
        background: 'var(--bt-color-surface-sunken)',
        overflow: 'hidden',
      }}
      role="progressbar"
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuemin={0}
      aria-valuemax={TEMPERATURE_MAX}
      aria-label="현재 사랑의 온도"
    >
      <div
        style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 999,
          background: 'linear-gradient(90deg, var(--bt-blue-400), var(--bt-rose-500))',
          transition: 'width var(--bt-duration-bloom) var(--bt-ease-standard)',
        }}
      />
    </div>
  )
}

/* ── 스탯 ───────────────────────────────────────────────── */

export function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="bt-numeric" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
        {value}
      </span>
      <span className="bt-caption bt-muted">{label}</span>
    </div>
  )
}

/* ── 키워드 · 뱃지 ──────────────────────────────────────── */

/** 누적 강점/보완 키워드 칩. 빈도를 함께 적어 "몇 번 그랬는지"가 근거로 남게 한다. */
export function KeywordChips({ keywords, tone }: { keywords: GrowthKeyword[]; tone: 'success' | 'warning' }) {
  if (keywords.length === 0) {
    return <p className="bt-body-sm bt-muted">세션이 쌓이면 반복되는 패턴을 모아 보여드려요.</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {keywords.map((k) => (
        <Badge key={k.label} tone={tone}>
          {k.label} ×<span className="bt-numeric">{k.count}</span>
        </Badge>
      ))}
    </div>
  )
}

export function BadgeChips({ badges }: { badges: EarnedBadge[] }) {
  if (badges.length === 0) {
    return <p className="bt-body-sm bt-muted">첫 세션을 마치면 첫 뱃지를 받을 수 있어요.</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <TagChip key={b.code} title={b.condition ?? undefined}>
          {b.emoji ?? '🏅'} {b.name}
        </TagChip>
      ))}
    </div>
  )
}
