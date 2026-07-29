import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, Icon } from '@/components'
import type { IssueSeverity, RadarAxis, ReportIssue, ReportMetric, ReportTopic, TemperatureDelta } from './types'

/* ── 온도 변화 카드 ─────────────────────────────────────── */

/**
 * 세션 전후 사랑의 온도 변화 (`REPORT-02`).
 *
 * 성장 대시보드 히어로(`.bt-hero`)와 같은 "따뜻해지는 코너 그라디언트" 어휘를 쓰지만,
 * 여기서는 리포트 안의 한 섹션일 뿐이라 그 히어로보다 작고 조용하게 만든다.
 * 증감 표기는 `.bt-delta` 를 그대로 재사용해 성장 대시보드와 같은 시각 언어를 유지한다.
 */
export function TemperatureCard({ temp, className }: { temp: TemperatureDelta; className?: string }) {
  const up = temp.delta >= 0
  return (
    <div className={`bt-temp-card ${className ?? ''}`}>
      <div className="bt-temp-card__top">
        <div>
          <span className="bt-overline">사랑의 온도</span>
          <div className="bt-temp-card__row">
            <span className="bt-temp-card__before bt-numeric">{temp.before.toFixed(1)}°</span>
            <Icon name="chevron-right" size={16} className="bt-temp-card__arrow" />
            <span className="bt-temp-card__after bt-numeric">{temp.after.toFixed(1)}°</span>
            <span className={`bt-delta ${up ? 'bt-delta--up' : 'bt-delta--down'}`}>
              <Icon name={up ? 'arrow-up' : 'arrow-down'} size={14} />
              {Math.abs(temp.delta).toFixed(1)}
            </span>
          </div>
        </div>
        <Link className="bt-temp-card__cta" to="/growth">
          추이 보기
          <Icon name="chevron-right" size={14} />
        </Link>
      </div>
      {temp.reason && <p className="bt-caption bt-muted mt-3">{temp.reason}</p>}
    </div>
  )
}

/* ── 레이더 차트 ────────────────────────────────────────── */

/**
 * AI 분석 vs 상대 평가 레이더 (`REPORT-01`).
 *
 * 디자인 시스템 §6: AI 분석 = `--bt-color-brand`, 상대 평가 = `--bt-color-success-marker`.
 * 두 계열은 색상환에서 충분히 떨어져 있고 색각 이상에서도 명도차로 구분된다.
 *
 * ⚠️ 임의 구현 1: 시스템 문서는 Chart.js 를 전제하지만 프로젝트에 차트 의존성이 없어
 *    의존성 추가 없이 **인라인 SVG**로 그렸다(축 6개 고정 도형이라 라이브러리 이득이 적다).
 * ⚠️ 임의 구현 2(D-13): "상대 평가 우선"을 **시각 강조**로 해석했다 —
 *    상대 계열을 위에, 더 굵고 진하게 그린다. 온도 가중치 해석이면 서버 산식이 따로 필요하다.
 *
 * 좌표계 주의: 라벨은 도형 바깥(반지름 ×1.26)에 놓이므로 viewBox 는 **도형 크기 + 라벨 여백**이다.
 * 예전처럼 정사각 260 에 도형과 라벨을 함께 넣으면 좌우 라벨이 뷰박스 밖으로 잘렸다.
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
