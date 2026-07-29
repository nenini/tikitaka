import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Button, Modal, VisuallyHidden } from '@/components'
import { badgeArtOf } from './badges'
import type { EarnedBadge, GrowthKeyword, TemperaturePoint } from './types'

/* ── 온도 추이 ──────────────────────────────────────────── */

/** 차트 안쪽 여백. 좌측은 y축 라벨, 하단은 회차 라벨 자리다. */
const PAD = { top: 22, right: 20, bottom: 26, left: 38 }
const CHART_HEIGHT = 200


export function TemperatureTrend({ points }: { points: TemperaturePoint[] }) {
  const gradientId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(wrapRef)
  const [active, setActive] = useState<string | null>(null)

  if (points.length === 0) {
    // 히어로 면 위에 얹히므로 배경을 따로 깔지 않는다 — 면 안에 또 면을 만들면 카드가 겹친다
    return (
      <div className="grid place-items-center" style={{ height: CHART_HEIGHT }}>
        <p className="bt-body-sm bt-muted">아직 기록된 세션이 없어요.</p>
      </div>
    )
  }

  const values = points.map((p) => p.temperatureAfter)
  const floor = Math.floor(Math.min(...values) - 1)
  const ceil = Math.ceil(Math.max(...values) + 1)
  const span = Math.max(1, ceil - floor)

  const innerW = Math.max(1, width - PAD.left - PAD.right)
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom

  // 점이 하나뿐이면 가운데에 세운다(0 으로 나누지 않기 위해서이기도 하다)
  const xOf = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const yOf = (v: number) => PAD.top + innerH - ((v - floor) / span) * innerH

  const coords = points.map((p, i) => [xOf(i), yOf(p.temperatureAfter)] as const)
  const linePath = smoothPath(coords)
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1][0]},${PAD.top + innerH} L ${coords[0][0]},${PAD.top + innerH} Z`
      : ''

  const gridValues = [ceil, floor + span / 2, floor]
  // 회차 라벨이 겹치지 않도록 건너뛰며 그린다
  const labelStep = Math.ceil(points.length / 8)

  const activeIndex = points.findIndex((p) => p.sessionId === active)
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null

  return (
    // min-w-0 + overflow-hidden 이 없으면 SVG 의 고유 폭(width 속성)이 카드의 최소 폭이 되어
    // 화면이 좁아져도 카드가 줄지 않고, 그래서 여기서 잰 폭도 영영 줄지 않는다(측정 되먹임).
    <div ref={wrapRef} className="relative w-full min-w-0 overflow-hidden">
      {width > 0 && (
        <svg
          width={width}
          height={CHART_HEIGHT}
          // role="img" 로 두면 안의 점들이 접근성 트리에서 사라진다 — 값을 읽히려면 컨테이너여야 한다
          role="group"
          aria-label="세션별 사랑의 온도 추이"
          style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            {/* 선은 왼쪽(과거)에서 오른쪽(지금)으로 갈수록 따뜻해진다  */}
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--bt-blue-400)" />
              <stop offset="100%" stopColor="var(--bt-rose-500)" />
            </linearGradient>
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bt-rose-400)" stopOpacity="0.26" />
              <stop offset="55%" stopColor="var(--bt-blue-400)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--bt-blue-400)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 눈금선 + y 라벨. 선 높이만으로는 값을 견줄 수 없다 */}
          {gridValues.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yOf(v)}
                y2={yOf(v)}
                stroke="var(--bt-color-border)"
                strokeWidth={1}
                strokeDasharray={v === floor ? undefined : '2 5'}
              />
              <text
                x={PAD.left - 10}
                y={yOf(v)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--bt-color-text-tertiary)"
              >
                {v.toFixed(0)}°
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradientId}-area)`} />
          <path
            className="bt-trend__line"
            d={linePath}
            fill="none"
            stroke={`url(#${gradientId}-line)`}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            // 경로 길이를 1 로 정규화한다 — 실제 길이(점 개수·폭에 따라 달라짐)와 무관하게
            // CSS 가 dasharray:1 로 그리기 애니메이션을 걸 수 있다.
            pathLength={1}
          />

          {/* 활성 점의 세로 가이드 */}
          {activePoint && (
            <line
              x1={coords[activeIndex][0]}
              x2={coords[activeIndex][0]}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--bt-color-text-tertiary)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
          )}

          {points.map((p, i) => {
            const [x, y] = coords[i]
            const isActive = p.sessionId === active
            // 마지막 점이 '지금'이다. 눈이 어디서 끝나야 하는지 표시해 준다.
            const isLatest = i === points.length - 1
            const dotColor = isLatest ? 'var(--bt-rose-500)' : 'var(--bt-color-brand)'
            return (
              <g key={p.sessionId}>
                {isLatest && (
                  <circle cx={x} cy={y} r={9} fill="var(--bt-rose-500)" opacity={0.16} />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? 5.5 : isLatest ? 4.5 : 3.5}
                  fill="var(--bt-color-surface)"
                  stroke={dotColor}
                  strokeWidth={isActive ? 3 : 2.25}
                />
                {/* 손가락·마우스가 닿는 넉넉한 히트 영역. 점 자체는 작아도 짚기 쉬워야 한다 */}
                <circle
                  cx={x}
                  cy={y}
                  r={Math.max(14, innerW / points.length / 2)}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${p.sessionNo}회차, ${p.temperatureAfter.toFixed(1)}도, 이전 대비 ${p.delta >= 0 ? '상승' : '하락'} ${Math.abs(p.delta).toFixed(1)}도`}
                  style={{ cursor: 'pointer', outline: 'none' }}
                  onMouseEnter={() => setActive(p.sessionId)}
                  onFocus={() => setActive(p.sessionId)}
                  onBlur={() => setActive(null)}
                  // 토글이 아니라 선택이다 — 클릭은 focus 뒤에 오므로 토글로 두면 방금 켠 값이 곧바로 꺼진다
                  onClick={() => setActive(p.sessionId)}
                />
                {i % labelStep === 0 && (
                  <text
                    x={x}
                    y={CHART_HEIGHT - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill={isActive ? 'var(--bt-color-action)' : 'var(--bt-color-text-tertiary)'}
                    fontWeight={isActive ? 700 : 400}
                  >
                    {p.sessionNo}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}

      {/* 값 툴팁. SVG 안에 그리면 잘리므로 위에 겹쳐 띄우고, 가장자리에서 밀어 넣는다 */}
      {activePoint && width > 0 && (
        <div
          className="bt-trend__tip"
          style={{
            left: clamp(coords[activeIndex][0], 62, width - 62),
            top: Math.max(0, coords[activeIndex][1] - 56),
          }}
          aria-hidden="true"
        >
          <span className="bt-caption">
            <span className="bt-numeric">{activePoint.sessionNo}</span>회차
          </span>
          <b className="bt-numeric" style={{ fontSize: 17 }}>
            {activePoint.temperatureAfter.toFixed(1)}°
          </b>
          {/* <span
            className="bt-caption bt-numeric"
            style={{
              color: activePoint.delta >= 0 ? 'var(--bt-color-success)' : 'var(--bt-color-warning)',
            }}
          >
            {activePoint.delta >= 0 ? '+' : ''}
            {activePoint.delta.toFixed(1)}
          </span> */}
        </div>
      )}

      <VisuallyHidden>
        <ul>
          {points.map((p) => (
            <li key={p.sessionId}>
              {p.sessionNo}회차: {p.temperatureAfter.toFixed(1)}도
            </li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  )
}

/**
 * 점들을 부드러운 곡선으로 잇는다(Catmull-Rom → 3차 베지에).
 * 꺾은선은 데이터가 실제보다 극적으로 보이고, 이 화면의 온도는 그렇게 튀는 값이 아니다.
 * 오버슛으로 곡선이 데이터 밖까지 부풀지 않도록 장력을 낮게(0.18) 잡았다.
 */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`

  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const t = 0.18
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t]
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t]
    d += ` C ${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/**
 * 컨테이너 실제 폭(px). SVG 를 viewBox 로 늘이면 선 굵기와 점이 함께 찌그러지므로
 * 실제 폭에 맞춰 좌표를 다시 계산한다.
 */
function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    let raf = 0
    let tries = 0

    // 마운트 시점에 폭이 0 으로 잡히는 경우가 있다(배경 탭·접힌 패널처럼 아직 배치되지 않은 컨테이너).
    // ResizeObserver 만 믿으면 그 경우 차트가 영영 안 그려지므로 다음 프레임에 다시 잰다.
    // 계속 0 이면(예: display:none 조상) 몇 프레임 뒤 포기하고 RO 에 맡긴다 — 무한 루프를 막는다.
    const measure = () => {
      const w = el.clientWidth
      setWidth(w)
      if (w === 0 && tries < 30) {
        tries += 1
        raf = requestAnimationFrame(measure)
      }
    }
    measure()

    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [ref])

  return width
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
 * 세션이 쌓이면 점이 붙어 읽히지 않는다. 한 화면에 고정 개수만 그리고 구간을 넘긴다.
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

/* ── 스탯 ───────────────────────────────────────────────── */

export interface InlineStatsProps {
  items: ReadonlyArray<{ value: string | number; label: string }>
  className?: string
}

/**
 * 숫자 몇 개를 나란히 세우는 스탯 줄.
 *
 * 아이콘을 넣은 색 타일 네 개를 늘어놓는 대신 **칸막이만 있는 활자**로 그린다.
 * 이 숫자들은 이 화면의 주인공(온도)이 아니라 배경 정보라, 카드로 만들면
 * 히어로와 무게가 같아져 어디를 먼저 볼지가 사라진다.
 */
export function InlineStats({ items, className }: InlineStatsProps) {
  return (
    <dl className={`bt-inline-stats ${className ?? ''}`}>
      {items.map((s) => (
        <div key={s.label} className="bt-inline-stats__item">
          <dd className="bt-inline-stats__value">{s.value}</dd>
          <dt className="bt-inline-stats__label">{s.label}</dt>
        </div>
      ))}
    </dl>
  )
}

/* ── 키워드 ─────────────────────────────────────────────── */

const KEYWORD_TONE_CLASS = {
  success: 'bt-keyword--success',
  warning: 'bt-keyword--warning',
} as const

/**
 * 누적 강점/보완 키워드.
 *
 * 여기서 중요한 건 **어떤 패턴이 반복되는가**지 몇 번인가가 아니다.
 * 횟수를 붙이면 읽는 사람이 숫자를 견주기 시작하고, 그 순간 이 화면은 성적표가 된다(원칙 1).
 * 그래서 라벨만 칩으로 늘어놓는다 — 정렬 순서가 이미 빈도순이다.
 */
export function KeywordChips({
  keywords,
  tone,
}: {
  keywords: GrowthKeyword[]
  tone: 'success' | 'warning'
}) {
  if (keywords.length === 0) {
    return <p className="bt-body-sm bt-muted">세션이 쌓이면 반복되는 패턴을 모아 보여드려요.</p>
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {keywords.map((k) => (
        <li key={k.label} className={`bt-keyword ${KEYWORD_TONE_CLASS[tone]}`}>
          {k.label}
        </li>
      ))}
    </ul>
  )
}

/* ── 뱃지 ───────────────────────────────────────────────── */

/** 접힌 상태에서 보여줄 뱃지 수. 3열 그리드라 두 줄이 꽉 차는 값. */
const BADGE_COLLAPSED_COUNT = 6

/**
 * 획득 뱃지 그리드. 그림만 나열하고 이름·조건은 눌렀을 때 연다 —
 * 카드마다 설명을 붙이면 뱃지 그림이 텍스트에 묻힌다.
 *
 * 뱃지가 쌓이면 이 카드만 끝없이 길어져 옆 칼럼과 높이가 어긋나므로,
 * 기본 개수까지만 펴고 나머지는 '더보기'로 접어 둔다(열 수가 컨테이너 폭에 따라
 * 달라져 "몇 줄"은 아니지만, 총 개수를 제한하는 목적은 같다).
 *
 * 아트가 없는 코드(`badges.ts` 미등록)는 그리지 않는다.
 */
export function BadgeGrid({
  badges,
  collapsedCount = BADGE_COLLAPSED_COUNT,
}: {
  badges: EarnedBadge[]
  collapsedCount?: number
}) {
  const [selected, setSelected] = useState<EarnedBadge | null>(null)
  const [expanded, setExpanded] = useState(false)
  const withArt = badges.filter((b) => badgeArtOf(b.code))

  if (withArt.length === 0) {
    return <p className="bt-body-sm bt-muted">첫 세션을 마치면 첫 뱃지를 받을 수 있어요.</p>
  }

  const overflow = withArt.length - collapsedCount
  const visible = expanded ? withArt : withArt.slice(0, collapsedCount)

  return (
    <>
      {/* 열 수를 고정하지 않는다 — 이 카드는 lg 이상에서는 340px 사이드바지만
          lg 미만(태블릿·모바일)에서는 본문 폭 그대로 늘어나므로, 열이 고정이면
          뱃지가 몇 개 없을 때 타일이 컨테이너 폭만큼 통째로 커진다(모바일에서 특히 두드러짐).
          auto-fill 은 뷰포트가 아니라 실제 렌더된 폭을 기준으로 몇 열이 들어갈지 스스로 계산하므로
          사이드바든 전체 폭이든 타일 크기가 일정하게 유지된다. */}
      <ul className="bt-badge-grid">
        {visible.map((badge) => {
          const art = badgeArtOf(badge.code)
          if (!art) return null
          return (
            <li key={badge.code}>
              <button
                type="button"
                className="bt-badge-tile"
                aria-label={`${badge.name} 뱃지 자세히 보기`}
                onClick={() => setSelected(badge)}
              >
                <img src={art.image} alt="" loading="lazy" />
              </button>
            </li>
          )
        })}
      </ul>

      {overflow > 0 && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            block
            trailingIcon={expanded ? undefined : 'chevron-down'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '접기' : `뱃지 ${overflow}개 더보기`}
          </Button>
        </div>
      )}

      <BadgeDetailModal badge={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function BadgeDetailModal({ badge, onClose }: { badge: EarnedBadge | null; onClose: () => void }) {
  const art = badge ? badgeArtOf(badge.code) : null
  return (
    <Modal
      open={badge != null}
      onClose={onClose}
      title={badge?.name ?? '뱃지'}
      actions={
        <Button variant="primary" onClick={onClose}>
          확인
        </Button>
      }
    >
      {badge && (
        <div className="flex flex-col items-center gap-4 text-center">
          {art && (
            <img
              src={art.image}
              alt={art.artAlt}
              width={140}
              height={140}
              style={{ width: 140, height: 140, objectFit: 'contain' }}
            />
          )}
          {badge.condition && <p className="bt-body">{badge.condition}</p>}
          <span className="bt-caption bt-muted">{formatAcquired(badge.acquiredAt)} 획득</span>
        </div>
      )}
    </Modal>
  )
}

function formatAcquired(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { dateStyle: 'long' })
}
