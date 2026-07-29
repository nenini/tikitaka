import { useState } from 'react'
import { Badge, Button, Icon, TagChip, VisuallyHidden } from '@/components'
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

const TRACK_LABEL = { REAL: '실사용자', AI: 'AI 트랙' } as const

/* ── 온도 추이 ──────────────────────────────────────────── */

/**
 * 세션별 온도 추이 막대 (`GROWTH-01`).
 *
 * ⚠️ 임의 구현: y축을 0부터 그리면 30~38 구간의 변화가 거의 안 보여서
 *    **데이터 범위(최소−1 ~ 최대+1)로 축을 잡았다.** 대신 눈금선과 축 라벨을 그려
 *    "막대 길이 = 절대 온도"로 오독되지 않게 했다.
 *
 * 각 막대는 실제 `<button>` 이라 탭으로 순회하며 값을 읽을 수 있다 —
 * hover 로만 값을 알 수 있는 차트는 키보드·터치 사용자에게 그냥 그림이다.
 */
export function TemperatureTrend({ points }: { points: TemperaturePoint[] }) {
  const [active, setActive] = useState<string | null>(null)

  if (points.length === 0) {
    return <p className="bt-body-sm bt-muted">아직 기록된 세션이 없어요.</p>
  }

  const values = points.map((p) => p.temperatureAfter)
  const floor = Math.floor(Math.min(...values) - 1)
  const ceil = Math.ceil(Math.max(...values) + 1)
  const span = Math.max(1, ceil - floor)
  const mid = floor + span / 2

  const activePoint = points.find((p) => p.sessionId === active) ?? null

  return (
    <div>
      {/* 값 표시 슬롯. 자리를 미리 잡아둬야 값이 뜰 때 차트가 튀지 않는다 */}
      <div className="bt-caption mb-1 min-h-[1.4em]" aria-hidden="true">
        {activePoint ? (
          <>
            <span className="bt-numeric">{activePoint.sessionNo}</span>회차 ·{' '}
            {TRACK_LABEL[trackOf(activePoint)]} ·{' '}
            <b className="bt-numeric">{activePoint.temperatureAfter.toFixed(1)}</b>°{' '}
            <span className="bt-numeric bt-muted">
              ({activePoint.delta >= 0 ? '+' : ''}
              {activePoint.delta.toFixed(1)})
            </span>
          </>
        ) : (
          <span className="bt-muted">막대를 짚으면 그 세션의 온도를 볼 수 있어요</span>
        )}
      </div>

      <div className="relative" style={{ height: 132 }}>
        {/* 눈금선 — 막대 길이만으로는 값을 견줄 수 없다 */}
        {[0, 0.5, 1].map((ratio) => (
          <span
            key={ratio}
            className="pointer-events-none absolute inset-x-0 border-t"
            style={{ bottom: `${ratio * 100}%`, borderColor: 'var(--bt-color-border)' }}
            aria-hidden="true"
          />
        ))}

        <div className="flex h-full items-end gap-1.5">
          {points.map((p) => {
            const ratio = (p.temperatureAfter - floor) / span
            const isActive = active === p.sessionId
            return (
              <button
                key={p.sessionId}
                type="button"
                className="flex h-full flex-1 cursor-pointer flex-col justify-end gap-1 border-0 bg-transparent p-0"
                aria-label={`${p.sessionNo}회차 ${TRACK_LABEL[trackOf(p)]}, ${p.temperatureAfter.toFixed(1)}도`}
                aria-pressed={isActive}
                onMouseEnter={() => setActive(p.sessionId)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(p.sessionId)}
                onBlur={() => setActive(null)}
                // 토글이 아니라 **선택**이다 — 클릭은 focus 뒤에 오므로 토글로 두면
                // 방금 focus 가 켠 값을 클릭이 곧바로 꺼서 아무것도 안 보인다.
                onClick={() => setActive(p.sessionId)}
              >
                <span
                  className="w-full"
                  style={{
                    height: `${Math.max(6, ratio * 100)}%`,
                    borderRadius: '6px 6px 0 0',
                    background: TRACK_COLOR[trackOf(p)],
                    outline: isActive ? '2px solid var(--bt-color-text)' : undefined,
                    outlineOffset: 1,
                  }}
                />
                <span className="bt-caption bt-muted bt-numeric">{p.sessionNo}</span>
              </button>
            )
          })}
        </div>

        {/* 축 눈금값 */}
        <div className="bt-caption bt-muted pointer-events-none absolute inset-y-0 -left-1 hidden flex-col justify-between sm:flex">
          <span className="bt-numeric">{ceil}°</span>
          <span className="bt-numeric">{mid.toFixed(0)}°</span>
          <span className="bt-numeric">{floor}°</span>
        </div>
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
              {p.sessionNo}회차 ({TRACK_LABEL[trackOf(p)]}): {p.temperatureAfter.toFixed(1)}도
            </li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  )
}

/* ── 추이 페이지네이션 ──────────────────────────────────── */

export interface TrendPagerProps {
  /** 0-base 페이지 번호. 0 = 가장 최근 구간 */
  page: number
  pageCount: number
  /** 이 페이지가 담는 회차 범위 표시용 */
  rangeLabel: string
  onChange: (next: number) => void
}

/**
 * 세션이 쌓이면 막대가 1~2px 로 뭉개진다. 한 화면에 고정 개수만 그리고 구간을 넘긴다.
 * `page 0` 이 가장 최근이라, '이전'은 과거로 가는 방향이다.
 */
export function TrendPager({ page, pageCount, rangeLabel, onChange }: TrendPagerProps) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="ghost"
        size="sm"
        leadingIcon="chevron-left"
        disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
      >
        이전 세션
      </Button>
      <span className="bt-caption bt-muted" role="status" aria-live="polite">
        {rangeLabel}
      </span>
      <Button
        variant="ghost"
        size="sm"
        trailingIcon="chevron-right"
        disabled={page <= 0}
        onClick={() => onChange(page - 1)}
      >
        최근
      </Button>
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
    <ul className="flex flex-col gap-2">
      {badges.map((b) => (
        <li key={b.code} className="flex items-start gap-2">
          {/* 카탈로그 이모지는 서버가 뱃지마다 다르게 내려주는 도메인 값이라 그대로 쓰고,
              값이 없을 때만 아이콘으로 대체한다 */}
          {b.emoji ? (
            <span className="shrink-0" style={{ fontSize: 17, lineHeight: 1.2 }} aria-hidden="true">
              {b.emoji}
            </span>
          ) : (
            <Icon name="medal" size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--bt-color-brand)' }} />
          )}
          <span className="min-w-0">
            <TagChip>{b.name}</TagChip>
            {/* 획득 조건은 title 툴팁이 아니라 본문으로 — 터치·키보드에서는 툴팁이 열리지 않는다 */}
            {b.condition && <span className="bt-caption bt-muted mt-1 block">{b.condition}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
