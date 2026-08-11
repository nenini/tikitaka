import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { Badge, Button, Icon, Modal, VisuallyHidden } from '@/components'
import { badgeArtOf } from './badges'
import { TEMPERATURE_MAX, type EarnedBadge, type GrowthKeyword, type TemperaturePoint } from './types'

/* ── 온도 추이 ──────────────────────────────────────────── */

/**
 * 차트 안쪽 여백.
 * 위는 지금 온도 말풍선, 왼쪽은 구간 라벨(`50° 따뜻해요`), 아래는 날짜 라벨 자리다.
 */
const PAD = { top: 40, right: 26, bottom: 34, left: 96 }
/** 좁은 화면에서는 왼쪽 여백을 숫자 폭만 남긴다 */
const PAD_NARROW = { top: 40, right: 20, bottom: 32, left: 46 }
/** 이 폭 아래에서는 구간 설명 텍스트가 그래프를 밀어낸다 */
const NARROW_WIDTH = 560
const CHART_HEIGHT = 320

/** 눈금 숫자를 5 의 배수로 떨어뜨린다 — 축에 31.4° 같은 값이 서면 온도계로 읽히지 않는다 */
const AXIS_STEP = 5
/** 데이터가 창의 천장·바닥에 닿지 않게 두는 여유 */
const AXIS_MARGIN = 3
/** 창의 최소 폭. 1° 흔들림이 산맥처럼 보이는 것을 막는다 */
const AXIS_MIN_SPAN = 20

/**
 * y축이 보여줄 온도 창(window).
 *
 * 0~100 전체를 늘 그리면 실제 데이터(대개 30~40°)가 아래쪽 8% 에 눌려 붙어 **성장이
 * 보이지 않는다** — 성장 대시보드에서 이건 그래프가 제 일을 못 하는 것이다. 반대로 페이지마다
 * 다시 계산하면 구간을 넘길 때 축이 흔들려 선 모양을 견줄 수 없다.
 *
 * 그래서 **전체 이력**으로 한 번 계산해 창을 고정한다. 페이지를 넘겨도 축은 그대로다.
 */
function temperatureWindow(values: readonly number[]): { floor: number; ceil: number } {
  if (values.length === 0) return { floor: 0, ceil: AXIS_MIN_SPAN }

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  let floor = Math.max(0, Math.floor((lo - AXIS_MARGIN) / AXIS_STEP) * AXIS_STEP)
  let ceil = Math.min(TEMPERATURE_MAX, Math.ceil((hi + AXIS_MARGIN) / AXIS_STEP) * AXIS_STEP)

  // 좁으면 넓히고, 0·100 에 부딪히면 반대쪽으로 밀어 폭을 지킨다
  if (ceil - floor < AXIS_MIN_SPAN) {
    ceil = Math.min(TEMPERATURE_MAX, floor + AXIS_MIN_SPAN)
    floor = Math.max(0, ceil - AXIS_MIN_SPAN)
  }
  return { floor, ceil }
}

/** 말풍선 반폭(px) 추정치. 가장자리에서 밀어 넣을 때만 쓰므로 대략이면 된다. */
const CALLOUT_HALF = 58
/** 말풍선 실측 높이. 위로 띄울 자리가 있는지 판단할 때만 쓴다. */
const CALLOUT_HEIGHT = 62
/** 말풍선 꼬리 끝과 점 사이 간격 */
const CALLOUT_GAP = 18

/** 날짜 라벨 한 칸이 차지하는 폭("07.26" @12px ≈ 33px)과 라벨 사이 최소 간격 */
const DATE_LABEL_W = 34
const DATE_LABEL_GAP = 8

/** x축 라벨. 회차 번호보다 날짜가 "언제의 나"인지 바로 읽힌다. */
function toMonthDay(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export interface TemperatureTrendProps {
  /** 이 화면에 그릴 점(현재 페이지) */
  points: TemperaturePoint[]
  /**
   * y축 창을 계산할 기준 집합. **전체 이력**을 넘긴다 — 페이지마다 다시 재면 축이 흔들려
   * 구간을 넘길 때 선 모양을 견줄 수 없다. 생략하면 현재 페이지로 계산한다.
   */
  scaleFrom?: TemperaturePoint[]
}

export function TemperatureTrend({ points, scaleFrom }: TemperatureTrendProps) {
  const gradientId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(wrapRef)
  const [hovered, setHovered] = useState<string | null>(null)
  // 키보드로 짚었을 때만 포커스 링을 그린다. 마우스 클릭에는 활성 점 자체가 이미 응답이다.
  const [keyboard, setKeyboard] = useState(false)

  if (points.length === 0) {
    // 히어로 면 위에 얹히므로 배경을 따로 깔지 않는다 — 면 안에 또 면을 만들면 카드가 겹친다
    return (
      <div className="bt-trend grid place-items-center" style={{ height: CHART_HEIGHT }}>
        <p className="bt-body-sm bt-muted">아직 기록된 세션이 없어요.</p>
      </div>
    )
  }

  const narrow = width > 0 && width < NARROW_WIDTH
  const pad = narrow ? PAD_NARROW : PAD

  const innerW = Math.max(1, width - pad.left - pad.right)
  const innerH = CHART_HEIGHT - pad.top - pad.bottom
  const baseY = pad.top + innerH

  const { floor, ceil } = temperatureWindow((scaleFrom ?? points).map((p) => p.temperatureAfter))
  const span = Math.max(1, ceil - floor)

  // 점이 하나뿐이면 가운데에 세운다(0 으로 나누지 않기 위해서이기도 하다)
  const xOf = (i: number) =>
    pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const yOf = (v: number) => baseY - ((clamp(v, floor, ceil) - floor) / span) * innerH

  const coords = points.map((p, i) => [xOf(i), yOf(p.temperatureAfter)] as const)
  const linePath = smoothPath(coords)
  const areaPath = `${linePath} L ${coords[coords.length - 1][0]},${baseY} L ${coords[0][0]},${baseY} Z`

  // 구간 라벨이 끝나는 x. 첫 점의 날짜 라벨은 축(pad.left) 기준 가운데 정렬이라
  // 축보다 왼쪽으로 반 글자 넘어온다 — 여백을 축 바로 앞까지 쓰면 그 라벨과 맞닿는다.
  // 좁은 화면에서는 축 아래 설명을 접어서 겹칠 상대가 없으므로 간격을 좁혀 "100°" 를 살린다.
  const tierLabelRight = pad.left - (narrow ? 10 : 20)

  const gap = points.length > 1 ? innerW / (points.length - 1) : innerW
  const lastIndex = points.length - 1

  // 양 끝 라벨은 안쪽으로 정렬한다. 가운데 정렬로 두면 첫 라벨은 y축 라벨과 맞닿고
  // 마지막 라벨은 면 밖으로 반 글자 넘어간다(좁은 화면에서 잘린 것처럼 보인다).
  const anchorOf = (i: number) => (i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle')

  // 날짜 라벨을 몇 칸마다 그릴지는 **픽셀**로 정한다. 점 개수로 정하면 폭이 줄어도 단계가
  // 그대로라 라벨이 서로 파고든다(폭 460~500px 구간에서 07.22 와 07.26 이 7px 겹쳤다).
  const dateStep = Math.max(1, Math.ceil((DATE_LABEL_W + DATE_LABEL_GAP) / gap))
  // 양 끝 라벨은 안쪽 정렬이라 자기 자리를 한 글자 폭만큼 더 차지한다. 그 자리를 침범하는
  // 중간 라벨은 접는다 — 양 끝(처음과 지금)이 항상 이긴다.
  const firstRight = coords[0][0] + DATE_LABEL_W + DATE_LABEL_GAP
  const lastLeft = coords[lastIndex][0] - DATE_LABEL_W - DATE_LABEL_GAP
  const clearsEnds = (x: number, i: number) =>
    i === 0 || i === lastIndex || (x - DATE_LABEL_W / 2 > firstRight && x + DATE_LABEL_W / 2 < lastLeft)

  // 처음 들어왔을 때는 말풍선을 띄우지 않는다. 히어로의 큰 숫자가 이미 "지금 몇 도"를
  // 말하고 있어서, 같은 값을 말풍선으로 한 번 더 강조하면 둘 다 주인공이 되어 초점이 흩어진다.
  // 말풍선은 **짚었을 때의 응답**으로만 나타난다.
  const hoveredIndex = points.findIndex((p) => p.sessionId === hovered)
  const activeIndex = hoveredIndex >= 0 ? hoveredIndex : null
  const activePoint = activeIndex != null ? points[activeIndex] : null
  const [activeX, activeY] = activeIndex != null ? coords[activeIndex] : [0, 0]

  // 말풍선은 가장자리에서 안으로 밀어 넣고, 꼬리만 점 위에 남겨 둔다 —
  // 상자를 통째로 옮기면 어느 점의 값인지가 끊긴다.
  const calloutHalf = Math.min(CALLOUT_HALF, width / 2)
  const calloutX = clamp(activeX, calloutHalf, width - calloutHalf)
  // 위로 띄울 자리가 없으면 점 아래로 뒤집는다. 자리를 늘 비워 두면(위쪽 여백을 크게 잡으면)
  // 말풍선이 없는 평소에 그만큼이 빈 띠로 남는다.
  const flipped = activeY - CALLOUT_GAP - CALLOUT_HEIGHT < 4
  const calloutY = flipped ? activeY + CALLOUT_GAP : activeY - CALLOUT_GAP

  return (
    // min-w-0 + overflow-hidden 이 없으면 SVG 의 고유 폭(width 속성)이 카드의 최소 폭이 되어
    // 화면이 좁아져도 카드가 줄지 않고, 그래서 여기서 잰 폭도 영영 줄지 않는다(측정 되먹임).
    <div ref={wrapRef} className="bt-trend relative w-full min-w-0 overflow-hidden">
      {width > 0 && (
        <svg
          width={width}
          height={CHART_HEIGHT}
          // role="img" 로 두면 안의 점들이 접근성 트리에서 사라진다 — 값을 읽히려면 컨테이너여야 한다
          role="group"
          aria-label="날짜별 사랑의 온도 추이"
          style={{ display: 'block' }}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            {/* 면은 선 아래에서 아래로 갈수록 옅어진다. 선은 한 색으로 둔다 —
                구간 이름이 이미 높이의 뜻을 말하고 있어서 색까지 변하면 두 번 말하는 셈이다 */}
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bt-color-brand)" stopOpacity="0.3" />
              <stop offset="70%" stopColor="var(--bt-color-brand)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--bt-color-brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* 눈금선 + 구간 라벨. 선 높이만으로는 값을 견줄 수 없다 */}
          {[ceil, (ceil + floor) / 2, floor].map((value) => {
            const y = yOf(value)
            return (
              <g key={value}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke="var(--bt-color-border)"
                  strokeWidth={1}
                  strokeDasharray={value === floor ? undefined : '3 7'}
                />
                <text
                  x={tierLabelRight}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--bt-color-action)"
                  className="bt-numeric"
                >
                  {value}°
                </text>
              </g>
            )
          })}

          <path className="bt-trend__area" d={areaPath} fill={`url(#${gradientId}-area)`} />
          <path
            className="bt-trend__line"
            d={linePath}
            fill="none"
            stroke="var(--bt-color-brand)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            // 경로 길이를 1 로 정규화한다 — 실제 길이(점 개수·폭에 따라 달라짐)와 무관하게
            // CSS 가 dasharray:1 로 그리기 애니메이션을 걸 수 있다.
            pathLength={1}
          />

          {/* 선택된 점에서 축까지 내려오는 기둥. 말풍선이 가장자리에서 밀려나도
              이 기둥이 x축의 굵은 날짜와 점을 이어 줘서 어느 날의 값인지 끊기지 않는다 */}
          {activeIndex != null && (
            <line
              x1={activeX}
              x2={activeX}
              y1={activeY}
              y2={baseY}
              stroke="var(--bt-color-brand)"
              strokeWidth={1.5}
              opacity={0.3}
            />
          )}

          {points.map((p, i) => {
            const [x, y] = coords[i]
            const isActive = i === activeIndex
            // 마지막 점은 '지금'이다. 짚지 않아도 눈이 어디서 끝나야 하는지 표시해 준다.
            const isLatest = i === lastIndex
            const showDate = (i % dateStep === 0 || isLatest) && clearsEnds(x, i)
            return (
              <g key={p.sessionId}>
                {isActive ? (
                  <>
                    {/* 키보드 포커스 링. 시스템 규칙(2px 링 + 2px offset)을 SVG 로 옮긴 것 —
                        히트 영역은 지름 100px 이 넘어서 브라우저 기본 outline 을 쓰면
                        차트 절반을 감싸는 사각형이 그려진다. */}
                    {keyboard && (
                      <circle
                        cx={x}
                        cy={y}
                        r={14}
                        fill="none"
                        stroke="var(--bt-color-focus)"
                        strokeWidth={2}
                      />
                    )}
                    <circle cx={x} cy={y} r={12} fill="var(--bt-color-surface)" />
                    <circle
                      cx={x}
                      cy={y}
                      r={12}
                      fill="none"
                      stroke="var(--bt-color-brand)"
                      strokeWidth={1.5}
                      opacity={0.35}
                    />
                    <circle cx={x} cy={y} r={6.5} fill="var(--bt-color-brand)" />
                  </>
                ) : isLatest ? (
                  // 짚기 전의 '지금'. 활성 점보다 조용하게, 그래도 다른 점과는 구별되게.
                  <>
                    <circle cx={x} cy={y} r={7} fill="var(--bt-color-surface)" />
                    <circle cx={x} cy={y} r={5.5} fill="var(--bt-color-brand)" />
                  </>
                ) : (
                  <circle cx={x} cy={y} r={4} fill="var(--bt-color-brand)" />
                )}

                {/* 점 위에 값을 적지 않는다 — 숫자 여덟 개가 늘어서면 선의 모양보다 숫자가
                    먼저 읽혀서 추이 그래프가 성적표가 된다(원칙 1). 값은 짚었을 때 말풍선이 답한다. */}

                {/* 히트 영역 실제 점보다 넓게 */}
                <circle
                  cx={x}
                  cy={y}
                  r={Math.max(14, gap / 2)}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${toMonthDay(p.createdAt)} ${p.sessionNo}회차, ${p.temperatureAfter.toFixed(1)}도, 이전 대비 ${p.delta >= 0 ? '상승' : '하락'} ${Math.abs(p.delta).toFixed(1)}도`}
                  // outline 을 지우는 대신 위의 SVG 링으로 대체한다 —
                  // 이 코드베이스에서 대체 없는 outline:none 은 버그다(DESIGN_SYSTEM §8).
                  style={{ cursor: 'pointer', outline: 'none' }}
                  onMouseEnter={() => setHovered(p.sessionId)}
                  onFocus={(e) => {
                    setHovered(p.sessionId)
                    setKeyboard(e.currentTarget.matches(':focus-visible'))
                  }}
                  onBlur={() => {
                    setHovered(null)
                    setKeyboard(false)
                  }}
                  // 토글이 아니라 선택이다 — 클릭은 focus 뒤에 오므로 토글로 두면 방금 켠 값이 곧바로 꺼진다
                  onClick={() => setHovered(p.sessionId)}
                />

                {showDate && (
                  <text
                    x={x}
                    y={CHART_HEIGHT - 10}
                    textAnchor={anchorOf(i)}
                    fontSize={12}
                    fill={isActive ? 'var(--bt-color-action)' : 'var(--bt-color-text-secondary)'}
                    fontWeight={isActive ? 700 : 400}
                    className="bt-numeric"
                  >
                    {toMonthDay(p.createdAt)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}

      {/* 값 말풍선. SVG 안에 그리면 글자 렌더와 그림자를 다루기 어려워 위에 겹쳐 띄운다.
          날짜를 함께 적는다 — 양 끝 점에서는 상자가 안쪽으로 밀려 꼬리만으로는 어느 점인지
          단정하기 어렵다. 여기의 날짜와 x축에서 굵어진 날짜가 같은 값이라 짝이 분명해진다. */}
      {width > 0 && activePoint && (
        <div
          className={`bt-trend__callout ${flipped ? 'bt-trend__callout--below' : ''}`}
          style={{
            left: calloutX,
            top: calloutY,
            // 꼬리는 상자가 밀려난 만큼 되돌려 실제 점을 가리킨다
            ['--_tail-x' as string]: `${activeX - calloutX}px`,
          }}
          aria-hidden="true"
        >
          <span className="bt-trend__callout-value">
            <span className="bt-numeric">{activePoint.temperatureAfter.toFixed(1)}°</span>
            <Icon name="bloom" size={16} />
          </span>
          <span className="bt-trend__callout-date bt-numeric">
            {toMonthDay(activePoint.createdAt)}
          </span>
        </div>
      )}

      <VisuallyHidden>
        <ul>
          {points.map((p) => (
            <li key={p.sessionId}>
              {toMonthDay(p.createdAt)} {p.sessionNo}회차: {p.temperatureAfter.toFixed(1)}도
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

/* ── 면(패널) ───────────────────────────────────────────── */

/**
 * 면을 물들이는 장식 도형.
 *
 * 아이콘이 아니라 **배경 도형**이다. 의미를 나르지 않으므로 접근성 트리에서 감춘다.
 * 면 밖으로 흘러넘치도록 잘려 나가는 게 정상이다 — 가운데 세운 원판 아이콘은
 * 어느 대시보드에나 있는 모양이라, 잘린 큰 도형 하나가 오히려 이 화면의 표식이 된다.
 */
const PANEL_MARKS = {
  /* 꽃잎 — 강점. 이 서비스의 "피어남" 어휘 */
  petal: <path d="M64 6c30 26 30 74 0 100C34 80 34 32 64 6Z" />,
  /* 반짝임 — 보완점. 아직 다듬는 중이라는 뜻으로 뾰족하지 않은 4각 별 */
  spark: <path d="M64 6c5 34 18 47 52 52-34 5-47 18-52 52-5-34-18-47-52-52 34-5 47-18 52-52Z" />,
  /* 꽃 — 뱃지. 잎 다섯 장이 도는 형태 */
  bloom: (
    <>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="64" cy="38" rx="19" ry="32" transform={`rotate(${deg} 64 64)`} />
      ))}
    </>
  ),
} as const

export type PanelMarkName = keyof typeof PANEL_MARKS

const PANEL_TONE_CLASS = {
  success: 'bt-panel--success',
  warning: 'bt-panel--warning',
  brand: 'bt-panel--brand',
} as const

export interface GrowthPanelProps {
  /** 면의 색. 내용의 성격을 글자보다 먼저 알린다 */
  tone: keyof typeof PANEL_TONE_CLASS
  title: string
  /** 제목 오른쪽 보조 표기(집계 기준·개수 등) */
  meta?: ReactNode
  mark: PanelMarkName
  className?: string
  children: ReactNode
}


export function GrowthPanel({ tone, title, meta, mark, className, children }: GrowthPanelProps) {
  return (
    <section className={`bt-panel ${PANEL_TONE_CLASS[tone]} ${className ?? ''}`}>
      <svg
        className="bt-panel__mark"
        viewBox="0 0 128 128"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        {PANEL_MARKS[mark]}
      </svg>

      <div className="bt-panel__head">
        <h2 className="bt-panel__title">{title}</h2>
        {meta != null && <span className="bt-caption bt-muted">{meta}</span>}
      </div>
      <div className="bt-panel__body">{children}</div>
    </section>
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
  onToggleDisplay,
}: {
  badges: EarnedBadge[]
  collapsedCount?: number
  /** 착용/해제. 넘기지 않으면 상세는 읽기 전용이 된다. */
  onToggleDisplay?: (badge: EarnedBadge, next: boolean) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const withArt = badges.filter((b) => badgeArtOf(b.code))

  // 목록에서 다시 찾는다 — 착용 상태가 바뀌면 모달도 새 값을 그려야 한다.
  const selected = withArt.find((b) => b.badgeId === selectedId) ?? null

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
            <li key={badge.badgeId}>
              <button
                type="button"
                // 착용 중인 뱃지는 흐리게 두지 않고 **미착용 쪽을 물러나게** 한다 —
                // 진열장에서 눈에 먼저 들어와야 하는 건 지금 달고 있는 뱃지다.
                className={badge.displayed ? 'bt-badge-tile bt-badge-tile--worn' : 'bt-badge-tile'}
                aria-label={`${badge.name} 뱃지${badge.displayed ? ' (착용 중)' : ''} 자세히 보기`}
                onClick={() => setSelectedId(badge.badgeId)}
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

      <BadgeDetailModal
        badge={selected}
        onClose={() => setSelectedId(null)}
        onToggleDisplay={onToggleDisplay}
      />
    </>
  )
}

function BadgeDetailModal({
  badge,
  onClose,
  onToggleDisplay,
}: {
  badge: EarnedBadge | null
  onClose: () => void
  onToggleDisplay?: (badge: EarnedBadge, next: boolean) => Promise<void>
}) {
  const art = badge ? badgeArtOf(badge.code) : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (!badge || !onToggleDisplay || busy) return
    setBusy(true)
    setError(null)
    try {
      await onToggleDisplay(badge, !badge.displayed)
    } catch {
      setError('상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={badge != null}
      // 요청 중에 닫으면 결과를 반영할 곳이 사라진다.
      onClose={busy ? () => {} : onClose}
      title={badge?.name ?? '뱃지'}
      actions={
        <>
          {badge && onToggleDisplay && (
            <Button
              variant={badge.displayed ? 'ghost' : 'primary'}
              loading={busy}
              onClick={() => void toggle()}
            >
              {badge.displayed ? '착용 해제' : '착용하기'}
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            닫기
          </Button>
        </>
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
          {badge.displayed && <Badge tone="success">착용 중</Badge>}
          {badge.condition && <p className="bt-body">{badge.condition}</p>}
          <span className="bt-caption bt-muted">{formatAcquired(badge.acquiredAt)} 획득</span>
          {error && <p className="bt-caption" style={{ color: 'var(--bt-color-danger)' }}>{error}</p>}
        </div>
      )}
    </Modal>
  )
}

function formatAcquired(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { dateStyle: 'long' })
}
