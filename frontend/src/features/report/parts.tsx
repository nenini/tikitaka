import { Badge, Card, VisuallyHidden } from '@/components'
import type { RadarAxis, ReportIssue, ReportMetric, ReportTopic } from './types'

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
 */
export function RadarChart({ axes, className }: { axes: RadarAxis[]; className?: string }) {
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const r = 82

  const point = (index: number, ratio: number) => {
    const angle = (-90 + (360 / axes.length) * index) * (Math.PI / 180)
    const radius = r * Math.max(0, Math.min(1, ratio))
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const
  }

  const polygon = (values: number[]) =>
    values.map((v, i) => point(i, v / 100).join(',')).join(' ')

  const hasPeer = axes.some((a) => a.peerScore != null)
  // 상대 평가가 없는 축(비언어 등)은 AI 값으로 이어 붙여 도형이 원점으로 꺾이지 않게 한다
  const peerValues = axes.map((a) => a.peerScore ?? a.aiScore)

  return (
    <div className={className}>
      {/* 정사각 viewBox 라 폭을 막지 않으면 넓은 카드에서 세로로도 그만큼 커진다 */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block w-full max-w-[300px]"
        role="img"
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

        {/* 축 라벨 */}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1.24)
          const dx = x - cx
          return (
            <text
              key={axis.key}
              x={x}
              y={y}
              fill="var(--bt-color-text-secondary)"
              fontSize={11}
              fontWeight={600}
              textAnchor={Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end'}
              dominantBaseline="middle"
            >
              {axis.label}
            </text>
          )
        })}
      </svg>

      {/* 그래프를 못 읽는 환경을 위한 값 목록 */}
      <VisuallyHidden>
        <ul>
          {axes.map((a) => (
            <li key={a.key}>
              {a.label}: 상대 평가 {a.peerScore ?? '없음'}, AI 분석 {a.aiScore}
            </li>
          ))}
        </ul>
      </VisuallyHidden>
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
 * 부적절 이슈 1건 (`REPORT-01-1`).
 * 형식은 **맥락 요약 + 전후 근거 + 대체 제안** 고정 — 발언만 나열하지 않는다.
 */
export function IssueCard({ issue }: { issue: ReportIssue }) {
  return (
    <Card style={{ borderColor: 'var(--bt-color-warning-marker)' }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="warning">감지</Badge>
        <b className="bt-body-sm">
          {issue.categoryLabel} · <span className="bt-numeric">{formatClock(issue.eventTimeSec)}</span>
        </b>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="bt-body-sm">
          <b>맥락 요약</b> — {issue.contextSummary}
        </p>

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
          <p className="bt-body-sm" style={{ color: 'var(--bt-color-success)' }}>
            💡 대체 제안 — “{issue.alternativeExpression}”
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

/* ── 대화 주제 ──────────────────────────────────────────── */

/**
 * 주제별 점유 시간을 글자 크기로 표현한다(목업의 워드 클라우드).
 * 크기만으로는 값을 알 수 없으므로 분 수를 라벨에 함께 적는다.
 */
export function TopicCloud({ topics }: { topics: ReportTopic[] }) {
  const max = Math.max(1, ...topics.map((t) => t.minutes))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {topics.map((t) => (
        <span
          key={t.label}
          className="rounded-full px-3 py-1"
          style={{
            fontSize: 11 + Math.round((t.minutes / max) * 6),
            fontWeight: 700,
            background: 'var(--bt-color-action-subtle)',
            color: 'var(--bt-color-action)',
          }}
        >
          {t.label} <span className="bt-numeric">{t.minutes}</span>분
        </span>
      ))}
    </div>
  )
}

/** 초 → mm:ss (세션 내 감지 시각). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
