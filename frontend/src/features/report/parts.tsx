import { useState } from 'react'
import { Icon } from '@/components'
import type {
  AnalysisEvidenceType,
  NarrativeItem,
  ReportEvidence,
  ReportTopicShare,
} from './types'

/* ── 레이더 차트 ────────────────────────────────────────── */

/**
 * 레이더에 그릴 축 1개. 서버 응답(`axes` 맵)을 화면이 표시용으로 펼친 형태다.
 *
 * ⚠️ 계열이 **하나**다. 예전에는 'AI 분석 + 상대 평가' 두 계열을 겹쳐 그렸는데,
 *    서버 리포트에는 상대 평가 점수가 없다(상호 평가는 `/evaluations` 별개 도메인).
 */
export interface RadarPoint {
  code: string
  label: string
  /** 0~100 비율. **미측정이면 null** */
  percent: number | null
  /** 1~5 원점수 */
  score: number | null
  measured: boolean
  /** 근거 한 줄 */
  note: string | null
  /** 원시값 표시 문구 (예: "30분당 2.5회") */
  rawText: string | null
  /** 미측정 사유. 사유를 아는 축에만 붙는다 — 없으면 일반 문구를 쓴다 */
  unmeasuredReason?: string | null
}

/**
 * 대화 행동 6축 레이더 (`REPORT-01`).
 *
 * 좌표계 주의: 라벨은 도형 바깥(반지름 ×1.26)에 놓이므로 viewBox 는 **도형 크기 + 라벨 여백**이다.
 *
 * **미측정 축은 도형에서 뺀다.** 0 으로 이어 붙이면 "최하점"으로 읽히는데,
 * 측정하지 못한 것과 못한 것은 다른 말이다. 라벨만 흐리게 남기고 아래에 개수를 알린다.
 */
export function RadarChart({
  axes,
  className,
  analysisMissing = false,
}: {
  axes: RadarPoint[]
  className?: string
  /** 분석 결과가 통째로 없는 경우. '측정 부족'과 원인이 달라 안내 문구를 뺀다. */
  analysisMissing?: boolean
}) {
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

  const gridPolygon = (ratio: number) =>
    axes.map((_, i) => point(i, ratio).join(',')).join(' ')

  // 측정된 축만 이어 붙인다. 0 으로 채우면 "최하점"으로 읽히는데, 측정하지 못한 것과
  // 못한 것은 다른 말이다.
  //
  // 2점일 때 아무것도 안 그리면 점 두 개만 남아 사용자에겐 '그래프가 깨진' 화면이 된다.
  // 비전 미수신 세션이 실제로 여기에 자주 걸린다. 면이 안 되면 선으로라도 잇는다.
  const measured = axes
    .map((axis, index) => ({ axis, index }))
    .filter(({ axis }) => axis.percent != null)
  const shape = measured.map(({ axis, index }) => point(index, (axis.percent ?? 0) / 100).join(',')).join(' ')
  const unmeasuredCount = axes.length - measured.length

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block w-full max-w-[340px]"
        // role="img" 로 두면 그래프가 **잎 노드**가 되어 안의 축 요소들이 접근성 트리에서 사라진다.
        // 축마다 점수를 읽히려면 컨테이너 역할이어야 한다.
        role="group"
        aria-label="대화 행동 6축 분석 레이더 차트"
      >
        {/* 눈금 링 */}
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <polygon
            key={ratio}
            points={gridPolygon(ratio)}
            fill="none"
            stroke="var(--bt-color-border)"
            strokeWidth={1}
          />
        ))}
        {/* 축선 */}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1)
          return (
            <line key={axis.code} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--bt-color-border)" strokeWidth={1} />
          )
        })}

        {measured.length >= 3 && (
          <polygon
            points={shape}
            fill="var(--bt-color-brand)"
            fillOpacity={0.18}
            stroke="var(--bt-color-brand)"
            strokeWidth={2.5}
          />
        )}
        {measured.length === 2 && (
          // 면이 안 되는 두 점. 선으로라도 이어야 '값이 있다'가 보인다.
          <polyline
            points={shape}
            fill="none"
            stroke="var(--bt-color-brand)"
            strokeWidth={2.5}
          />
        )}
        {/* 측정된 축의 꼭짓점. 도형이 안 그려지는 경우에도 값 위치는 보여야 한다 */}
        {measured.map(({ axis, index }) => {
          const [x, y] = point(index, (axis.percent ?? 0) / 100)
          return <circle key={`dot-${axis.code}`} cx={x} cy={y} r={3} fill="var(--bt-color-brand)" />
        })}

        {/* 축 라벨. 점수는 여기 적지 않는다 — 아래 슬롯이 hover/focus 시 정확한 값을 보여준다. */}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1.26)
          const dx = x - cx
          const anchor = Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end'
          const active = hovered === axis.code
          return (
            <text
              key={axis.code}
              x={x}
              y={y}
              fill={
                !axis.measured
                  ? 'var(--bt-color-text-tertiary)'
                  : active
                    ? 'var(--bt-color-text)'
                    : 'var(--bt-color-text-secondary)'
              }
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
            브라우저 기본 포커스 사각형이 그려져 클릭할 때마다 "검정 네모"가 나타난다. */}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1)
          return (
            <circle
              key={`hit-${axis.code}`}
              cx={x}
              cy={y}
              r={18}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={
                axis.measured && axis.score != null
                  ? `${axis.label}. 5점 만점에 ${axis.score}점${axis.note ? `. ${axis.note}` : ''}`
                  : `${axis.label}. 측정되지 않았어요${axis.unmeasuredReason ? `. ${axis.unmeasuredReason}` : ''}`
              }
              style={{ cursor: 'pointer', outline: 'none' }}
              onMouseEnter={() => setHovered(axis.code)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(axis.code)}
              onBlur={() => setHovered(null)}
            />
          )
        })}
      </svg>

      {/* 강조된 축의 상세. 툴팁을 SVG 안에 그리면 잘리므로 차트 아래 고정 슬롯에 둔다 */}
      <div className="bt-caption mt-1 min-h-[2.6em] text-center" aria-hidden="true">
        {hovered
          ? (() => {
              const axis = axes.find((a) => a.code === hovered)
              if (!axis) return null
              if (!axis.measured || axis.score == null) {
                return (
                  <>
                    <b>{axis.label} · 측정되지 않았어요</b>
                    {axis.unmeasuredReason && (
                      <span className="bt-muted block">{axis.unmeasuredReason}</span>
                    )}
                  </>
                )
              }
              return (
                <>
                  <b>
                    {axis.label} · <span className="bt-numeric">{axis.score}</span> / 5
                  </b>
                  {axis.note && <span className="bt-muted block">{axis.note}</span>}
                  {!axis.note && axis.rawText && <span className="bt-muted block">{axis.rawText}</span>}
                </>
              )
            })()
          : '축을 짚으면 점수와 근거를 볼 수 있어요'}
      </div>

      {/* 분석이 통째로 없으면 "측정되지 않아 제외했다"는 틀린 설명이다 —
          측정을 못 한 게 아니라 결과가 안 온 것이고, 카드 제목이 이미 그걸 말한다. */}
      {unmeasuredCount > 0 && !analysisMissing && (
        <p className="bt-caption bt-muted mt-1 text-center">
          <span className="bt-numeric">{unmeasuredCount}</span>개 축은 측정되지 않아 도형에서 제외했어요.
        </p>
      )}
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

/* ── 행동 근거 지표 ─────────────────────────────────────── */

/** 표시용 지표 1개. 서버는 원시 수치를 주므로 문구는 화면이 만든다. */
export interface MetricView {
  key: string
  label: string
  display: string
  /** 수치만으로 판단이 안 서는 지표에 붙이는 해석 한 마디 (예: 발화 비율 → '내가 더 많이') */
  badge?: string | null
  badgeTone?: 'neutral' | 'notice'
}

export function MetricStat({ metric }: { metric: MetricView }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-baseline gap-1.5">
        <span className="bt-numeric" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {metric.display}
        </span>
        {metric.badge && (
          // 평가가 아니라 관찰이다(§5 규칙 5) — 색으로 잘잘못을 매기지 않고 톤만 구분한다.
          <span
            className="bt-caption"
            style={{
              color:
                metric.badgeTone === 'notice'
                  ? 'var(--bt-color-text-secondary)'
                  : 'var(--bt-color-text-tertiary)',
              fontWeight: 600,
            }}
          >
            {metric.badge}
          </span>
        )}
      </span>
      <span className="bt-caption bt-muted">{metric.label}</span>
    </div>
  )
}

/* ── 주제별 발화 비중 ──────────────────────────────────── */

/**
 * "무슨 얘기를 얼마나 했나" 가로 막대.
 *
 * 차트 라이브러리를 쓰지 않는다 — 이 프로젝트에 recharts/d3 의존성이 없고, 레이더도
 * 손으로 그린 SVG 다. 막대 하나에 라이브러리를 들이는 건 번들만 키운다.
 *
 * 값은 AI 가 사전 기반으로 계산한 결정값이라 두 번 돌려도 같다. 그래서 "추정" 헤지를
 * 붙이지 않는다.
 */
export function TopicBreakdown({
  topics,
  analysisMissing = false,
}: {
  topics: readonly ReportTopicShare[]
  /** 분석 결과 자체가 없는 리포트. '주제가 없다'가 아니라 '지표가 안 왔다'이다. */
  analysisMissing?: boolean
}) {
  if (topics.length === 0) {
    // 원인을 단정하지 않는다. 빈 배열은 (a) 전사가 없었거나 (b) 이 필드가 생기기 전
    // 리포트이거나 (c) 분석이 유실된 경우인데, 서버 응답만으로는 (a)와 (b)를 못 가른다.
    // 같은 화면 위 축 카드가 "지표를 불러오지 못했어요"라고 말하는데 여기서 "전사가
    // 없어서"라고 단정하면 두 카드가 서로 다른 원인을 주장하게 된다.
    return (
      <NotMeasuredNote
        text={
          analysisMissing
            ? '지표를 불러오지 못해 대화 주제도 표시할 수 없어요.'
            : '대화 주제를 나눌 데이터가 없어요.'
        }
      />
    )
  }
  // 가장 긴 주제를 100% 폭으로 잡는다. 비중 자체는 숫자로 따로 보여주므로
  // 막대는 '무엇이 제일 많았나'를 한눈에 보여주는 역할만 한다.
  const longest = Math.max(...topics.map((t) => t.speakingMs), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {topics.map((topic) => (
        <li key={topic.topic} className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="bt-body-sm">{topic.label}</span>
            <span className="bt-caption bt-muted bt-numeric">
              {Math.round(topic.ratio * 100)}% · {formatSeconds(topic.speakingMs)}
            </span>
          </span>
          <span
            className="block h-2 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--bt-color-surface-sunken)' }}
            role="img"
            aria-label={`${topic.label} ${Math.round(topic.ratio * 100)}퍼센트, 발화 ${topic.utteranceCount}회`}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(2, (topic.speakingMs / longest) * 100)}%`,
                background: 'var(--bt-color-brand)',
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}

function formatSeconds(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}초`
  return `${Math.floor(total / 60)}분 ${total % 60}초`
}

/* ── 잘한 점 / 개선점 ───────────────────────────────────── */

/**
 * 목록은 실제 `<ul><li>` 로 그린다. `<p>· 텍스트</p>` 는 눈에만 목록이고
 * 스크린리더에는 "항목 3개"라는 정보가 전달되지 않는다.
 *
 * 서버가 문장별 출처(`sourceType`)를 주기 시작하면 그대로 받는다. 다만 **출처 코드는 화면에
 * 그리지 않는다** — `MEASURED_AXIS` 같은 내부 코드는 사용자에게 의미가 없고, 근거는 이미
 * 레이더의 축 note 와 '언제 그랬나요' 구간이 사람 말로 보여준다.
 */
export function FeedbackList({ items }: { items: readonly NarrativeItem[] }) {
  if (items.length === 0) {
    return <p className="bt-body-sm bt-muted">해당하는 내용이 없어요.</p>
  }
  return (
    <ul className="bt-body-sm flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, index) => (
        <li key={`${item.sourceCode ?? 'text'}-${index}`}>{item.text}</li>
      ))}
    </ul>
  )
}

/* ── 근거 구간 ──────────────────────────────────────────── */

const EVIDENCE_LABEL: Readonly<Record<AnalysisEvidenceType, string>> = {
  LONG_SILENCE: '긴 침묵',
  INTERRUPTION: '말 끊기',
  BACKCHANNEL: '맞장구',
  GAZE_AWAY: '시선 이탈',
  FACE_MISSING: '얼굴 벗어남',
  SMILE: '미소',
}

/**
 * 언제 무슨 일이 있었는지 (`REPORT-02` 설명가능성).
 * 점수만 보여주면 "왜 이 점수인지" 물어볼 근거가 없다. 구간과 시각을 함께 적는다.
 */
export function EvidenceList({ items }: { items: readonly ReportEvidence[] }) {
  if (items.length === 0) {
    return <p className="bt-body-sm bt-muted">기록된 근거 구간이 없어요.</p>
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="분석 근거 구간">
      {items.map((item) => (
        <li key={item.evidenceId} className="flex items-start gap-2.5">
          <span className="bt-caption bt-numeric bt-muted mt-0.5 w-11 shrink-0 text-right">
            {formatClock(item.startMs / 1000)}
          </span>
          <span className="bt-body-sm">
            <b>{EVIDENCE_LABEL[item.eventType]}</b>
            {item.description ? ` · ${item.description}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ── 미측정 안내 ────────────────────────────────────────── */

/** 비전 분석이 없을 때 지표 묶음 대신 보여주는 줄. 0 으로 그리면 사실과 달라진다. */
export function NotMeasuredNote({ text }: { text: string }) {
  return (
    <p className="bt-caption bt-muted flex items-center gap-1.5">
      <Icon name="info-circle" size={14} />
      {text}
    </p>
  )
}

/** 초 → mm:ss (세션 내 감지 시각). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
