import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, Icon } from '@/components'
import type { IssueSeverity, RadarAxis, ReportIssue, ReportMetric, ReportTopic, TemperatureDelta } from './types'

/* ── 온도 변화 카드 ─────────────────────────────────────── */

/**
 * 온도 척도의 최댓값. 성장 대시보드(`features/growth/types.ts` 의 `TEMPERATURE_MAX`)와 같은
 * 척도다 — 두 화면이 같은 0~100 위에서 같은 위치를 가리켜야 한다.
 */
const TEMPERATURE_SCALE_MAX = 100

/** 온도 → 척도상 위치(%). 서버 값이 범위를 벗어나도 트랙 밖으로 삐져나가지 않게 자른다. */
function scalePct(value: number): number {
  return Math.max(0, Math.min(100, (value / TEMPERATURE_SCALE_MAX) * 100))
}

/**
 * 세션 전후 사랑의 온도 변화 (`REPORT-02`).
 *
 * 이 카드는 리포트의 한 줄 결론이라 헤더 바로 아래에 온다. 그래서 묻는 건 딱 둘이다 —
 * **지금 몇 도이고, 이번 세션이 어디로 얼마나 움직였나.**
 *
 * - 큰 활자는 현재 온도 하나뿐이다. 전·후를 같은 크기로 나란히 놓으면 어느 쪽이 지금인지
 *   매번 읽어서 판단해야 한다. 세션 전 값은 캡션으로 내려 참조값 자리에 둔다.
 * - 변화는 숫자만으로는 크기를 알 수 없어(2.1 이 큰가?) 0~100 **척도 트랙** 위에 그린다.
 *   움직인 폭이 트랙에서 차지하는 길이가 곧 이번 세션의 폭이다.
 * - 증감 표기는 `.bt-delta` 를 그대로 재사용해 성장 대시보드와 같은 시각 언어를 유지한다.
 */
export function TemperatureCard({ temp, className }: { temp: TemperatureDelta; className?: string }) {
  // 0.05 미만은 소수 첫째 자리 표기에서 "0.0" 으로 보이므로 변화 없음으로 취급한다
  const flat = Math.abs(temp.delta) < 0.05
  const up = temp.delta > 0
  const lo = Math.min(temp.before, temp.after)
  const hi = Math.max(temp.before, temp.after)

  return (
    <section className={`bt-temp-card ${className ?? ''}`} aria-label="사랑의 온도 변화">
      <div className="bt-temp-card__head">
        <span className="bt-overline">사랑의 온도</span>
        <Link className="bt-temp-card__cta" to="/growth">
          추이 보기
          <Icon name="chevron-right" size={14} />
        </Link>
      </div>

      <div className="bt-temp-card__figures">
        <span className="bt-temp-card__value bt-numeric">
          {temp.after.toFixed(1)}
          <span className="bt-temp-card__unit">°</span>
        </span>
        {flat ? (
          <span className="bt-temp-card__flat">변화 없음</span>
        ) : (
          <span className={`bt-delta ${up ? 'bt-delta--up' : 'bt-delta--down'}`}>
            <Icon name={up ? 'arrow-up' : 'arrow-down'} size={15} />
            {Math.abs(temp.delta).toFixed(1)}
          </span>
        )}
        <span className="bt-temp-card__from bt-caption bt-muted">
          세션 전 <span className="bt-numeric">{temp.before.toFixed(1)}°</span>
        </span>
      </div>

      <div className="bt-temp-card__scale" aria-hidden="true">
        <div className="bt-temp-card__track">
          <span className="bt-temp-card__base" style={{ width: `${scalePct(lo)}%` }} />
          {!flat && (
            <span
              className={`bt-temp-card__move ${up ? '' : 'bt-temp-card__move--down'}`}
              style={{ left: `${scalePct(lo)}%`, width: `${scalePct(hi) - scalePct(lo)}%` }}
            />
          )}
        </div>
        <div className="bt-temp-card__ticks bt-numeric">
          <span>0°</span>
          <span>{TEMPERATURE_SCALE_MAX}°</span>
        </div>
      </div>

      {temp.reason && <p className="bt-temp-card__reason bt-caption">{temp.reason}</p>}
    </section>
  )
}

/* ── 레이더 차트 ────────────────────────────────────────── */

/**
 * AI 분석 vs 상대 평가 레이더 (`REPORT-01`).
 * 좌표계 주의: 라벨은 도형 바깥(반지름 ×1.26)에 놓이므로 viewBox 는 **도형 크기 + 라벨 여백**이다.
 */
export function RadarChart({ axes, className }: { axes: RadarAxis[]; className?: string }) {
  /** 도형 반지름 */
  const r = 74
  /** 라벨이 차지하는 바깥 여백. 5~6글자 축 이름이 잘리지 않을 만큼 잡는다 */
  const pad = 56
  const size = (r + pad) * 2
  const cx = size / 2
  const cy = size / 2

  const [hovered, setHovered] = useState<string | null>(null)

  const point = (index: number, ratio: number) => {
    const angle = (-90 + (360 / axes.length) * index) * (Math.PI / 180)
    const radius = r * Math.max(0, Math.min(1, ratio))
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const
  }

  const polygon = (values: number[]) => values.map((v, i) => point(i, v / 100).join(',')).join(' ')

  const hasPeer = axes.some((a) => a.peerScore != null)
  // 상대 평가가 없는 축(비언어 등)은 AI 값으로 이어 붙여 도형이 원점으로 꺾이지 않게 한다
  const peerValues = axes.map((a) => a.peerScore ?? a.aiScore)

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block w-full max-w-[340px]"
        // role="img" 로 두면 그래프가 **잎 노드**가 되어 안의 축 요소들이 접근성 트리에서 사라진다.
        // 축마다 점수를 읽히려면 컨테이너 역할이어야 한다.
        role="group"
        aria-label="AI 분석과 상대 평가 비교 레이더 차트"
      >
        {/* 눈금 링 */}
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <polygon
            key={ratio}
            points={polygon(axes.map(() => ratio * 100))}
            fill="none"
            stroke="var(--bt-color-border)"
            strokeWidth={1}
          />
        ))}
        {/* 축선 */}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1)
          return (
            <line key={axis.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--bt-color-border)" strokeWidth={1} />
          )
        })}

        {/* AI 계열 — 참고선이라 얇고 옅게 */}
        <polygon
          points={polygon(axes.map((a) => a.aiScore))}
          fill="var(--bt-color-brand)"
          fillOpacity={0.1}
          stroke="var(--bt-color-brand)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {/* 상대 평가 계열 — 위에, 더 진하게(D-13 시각 우선) */}
        {hasPeer && (
          <polygon
            points={polygon(peerValues)}
            fill="var(--bt-color-success-marker)"
            fillOpacity={0.2}
            stroke="var(--bt-color-success-marker)"
            strokeWidth={2.5}
          />
        )}

        {/* 축 라벨. 점수는 여기 적지 않는다 — 아래 툴팁 슬롯이 hover/focus 시 정확한 값을
            보여주므로, 기본 상태에서까지 숫자를 박아두면 도형 위가 시끄러워진다. */}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1.26)
          const dx = x - cx
          const anchor = Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end'
          const active = hovered === axis.key
          return (
            <text
              key={axis.key}
              x={x}
              y={y}
              fill={active ? 'var(--bt-color-text)' : 'var(--bt-color-text-secondary)'}
              fontSize={11}
              fontWeight={active ? 700 : 600}
              textAnchor={anchor}
              dominantBaseline="middle"
              opacity={hovered && !active ? 0.45 : 1}
            >
              {axis.label}
            </text>
          )
        })}

        {/* 축별 hover/focus 히트 영역. 마우스와 키보드가 같은 정보를 얻게 한다.
            outline 을 명시적으로 지운다 — 지우지 않으면 이 원의 사각 바운딩 박스에
            브라우저 기본 포커스 사각형이 그대로 그려져 클릭할 때마다 "검정 네모"가 나타난다.
            대신 위 라벨의 굵기·색·주변 축 옅어짐으로 포커스 상태를 표시한다. */}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1)
          return (
            <circle
              key={`hit-${axis.key}`}
              cx={x}
              cy={y}
              r={18}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${axis.label}. ${axis.peerScore != null ? `상대 평가 ${axis.peerScore}점, ` : ''}AI 분석 ${axis.aiScore}점`}
              style={{ cursor: 'pointer', outline: 'none' }}
              onMouseEnter={() => setHovered(axis.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(axis.key)}
              onBlur={() => setHovered(null)}
            />
          )
        })}
      </svg>

      {/* 강조된 축의 상세. 툴팁을 SVG 안에 그리면 잘리므로 차트 아래 고정 슬롯에 둔다 */}
      <div className="bt-caption mt-1 min-h-[1.4em] text-center" aria-hidden="true">
        {hovered
          ? (() => {
            const axis = axes.find((a) => a.key === hovered)
            if (!axis) return null
            return axis.peerScore != null
              ? `${axis.label} · 상대 평가 ${axis.peerScore} / AI 분석 ${axis.aiScore}`
              : `${axis.label} · AI 분석 ${axis.aiScore}`
          })()
          : '축을 짚으면 점수를 볼 수 있어요'}
      </div>
    </div>
  )
}

/** 레이더 범례. 상대 평가를 먼저 적는다(우선 표시 원칙). */
export function RadarLegend({ hasPeer }: { hasPeer: boolean }) {
  return (
    <div className="flex flex-wrap gap-4">
      {hasPeer && <LegendDot color="var(--bt-color-success-marker)" label="상대 평가" />}
      <LegendDot color="var(--bt-color-brand)" label="AI 분석" />
    </div>
  )
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="bt-caption flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

/* ── 이슈 맥락 카드 ─────────────────────────────────────── */

/**
 * 심각도별 표시. 색만으로 구분하지 않고 **아이콘과 배지 문구**를 함께 바꾼다
 * — 색각 이상에서도 "참고"와 "주의"가 구분돼야 한다.
 */
const SEVERITY_STYLE = {
  info: { tone: 'neutral', icon: 'info-circle', label: '참고', color: 'var(--bt-color-border-strong)' },
  warning: { tone: 'warning', icon: 'warning', label: '주의', color: 'var(--bt-color-warning-marker)' },
  critical: { tone: 'danger', icon: 'error-circle', label: '집중 확인', color: 'var(--bt-color-danger-marker)' },
} as const satisfies Record<IssueSeverity, { tone: 'neutral' | 'warning' | 'danger'; icon: 'info-circle' | 'warning' | 'error-circle'; label: string; color: string }>

/**
 * 부적절 이슈 1건 (`REPORT-01-1`).
 * 형식은 **맥락 요약 + 전후 근거 + 대체 제안** 고정 — 발언만 나열하지 않는다.
 */
export function IssueCard({ issue }: { issue: ReportIssue }) {
  const severity = SEVERITY_STYLE[issue.severity ?? 'warning']

  return (
    // <Card style={{ borderColor: severity.color, borderLeftWidth: 3 }}>
    <Card><div className="mb-2 flex flex-wrap items-center gap-2">
      <Badge tone={severity.tone}>
        <Icon name={severity.icon} size={12} />
        {severity.label}
      </Badge>
      <b className="bt-body-sm">
        {issue.categoryLabel} · <span className="bt-numeric">{formatClock(issue.eventTimeSec)}</span>
      </b>
    </div>

      <div className="flex flex-col gap-2.5">
        <div>
          <span className="bt-overline">맥락 요약</span>
          <p className="bt-body-sm mt-1">{issue.contextSummary}</p>
        </div>

        {issue.evidenceExcerpt ? (
          <blockquote
            className="bt-body-sm rounded-[var(--bt-radius-lg)] px-3 py-2.5"
            style={{ background: 'var(--bt-color-surface-sunken)' }}
          >
            {issue.evidenceExcerpt}
            <span className="bt-caption bt-muted"> (전후 3~4문장 근거)</span>
          </blockquote>
        ) : (
          <p className="bt-caption bt-muted">
            발언 발췌 저장에 동의하지 않아 근거 문장은 표시되지 않아요. 맥락 요약과 지표로만 안내합니다.
          </p>
        )}

        {issue.alternativeExpression && (
          <p className="bt-body-sm flex items-start gap-2" style={{ color: 'var(--bt-color-success)' }}>
            <Icon name="bulb" size={16} className="mt-0.5 shrink-0" />
            <span>대체 제안 — “{issue.alternativeExpression}”</span>
          </p>
        )}
      </div>
    </Card>
  )
}

/* ── 행동 근거 지표 ─────────────────────────────────────── */

export function MetricStat({ metric }: { metric: ReportMetric }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="bt-numeric" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
        {metric.display}
      </span>
      <span className="bt-caption bt-muted">{metric.label}</span>
    </div>
  )
}

/* ── 잘한 점 / 개선점 ───────────────────────────────────── */

/**
 * 목록은 실제 `<ul><li>` 로 그린다. `<p>· 텍스트</p>` 는 눈에만 목록이고
 * 스크린리더에는 "항목 3개"라는 정보가 전달되지 않는다.
 */
export function FeedbackList({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return <p className="bt-body-sm bt-muted">해당하는 내용이 없어요.</p>
  }
  return (
    <ul className="bt-body-sm flex list-disc flex-col gap-1.5 pl-5">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  )
}

/* ── 대화 주제 ──────────────────────────────────────────── */

/**
 * 주제별 점유 시간.
 *
 * 예전에는 글자 크기(11~17px)로 비중을 표현했는데, 11px 는 본문 하한(12px)보다 작고 6px 차이는
 * 눈으로 구분되지 않아 "작아서 못 읽는 워드 클라우드"만 남았다. 길이로 비교하는 막대로 바꾼다.
 */
export function TopicCloud({ topics }: { topics: ReportTopic[] }) {
  const max = Math.max(1, ...topics.map((t) => t.minutes))
  return (
    <ul className="flex flex-col gap-2" aria-label="주제별 대화 시간">
      {topics.map((t) => (
        <li key={t.label} className="flex items-center gap-3">
          <span className="bt-body-sm w-[7.5rem] shrink-0 truncate">{t.label}</span>
          <span
            className="h-2.5 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--bt-color-surface-sunken)' }}
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${(t.minutes / max) * 100}%`, background: 'var(--bt-color-action)' }}
            />
          </span>
          <span className="bt-caption bt-muted bt-numeric w-9 shrink-0 text-right">{t.minutes}분</span>
        </li>
      ))}
    </ul>
  )
}

/** 초 → mm:ss (세션 내 감지 시각). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
