import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Badge,
  Button,
  Callout,
  Card,
  Cluster,
  EmptyState,
  Hedge,
  Icon,
  Skeleton,
  TagChip,
} from '@/components'
import { createChatReport, getChatReport } from './api'
import { STAGE_LABEL } from './types'
import type { ChatHighlight, ChatReport } from './types'

/** 생성 중일 때 다시 물어보는 주기. */
const POLL_MS = 8_000

/**
 * W-10b 종료 후 · AI 챗봇 종합 피드백 (`AI_CHAT`, FE-B).
 *
 * 대화를 종료하면 `POST .../report` 로 생성을 걸고 이 화면에서 `GET .../report` 로 받는다.
 *
 * 규칙:
 *  - 🔒 챗봇 결과는 **사랑의 온도에 반영하지 않는다**(W-10b 규칙) — 온도·등수·레이더를 넣지 않는다.
 *    화상 세션 리포트(W-16)와 같은 모양으로 그리면 사용자가 같은 무게로 착각한다.
 *  - 화법 §7.4: 점수 대신 **횟수와 사실**, 추정은 추정으로(Hedge), 끝에는 다음 행동.
 */
export function ChatReportPage() {
  const { chatSessionId: chatSessionIdParam } = useParams()
  const navigate = useNavigate()

  // 백엔드 sessionId 는 Long 이다.
  const chatSessionId = Number(chatSessionIdParam)

  const [report, setReport] = useState<ChatReport | null>(null)
  const [retrying, setRetrying] = useState(false)
  const aliveRef = useRef(true)

  const load = useCallback(async () => {
    if (!Number.isFinite(chatSessionId) || chatSessionId <= 0) return
    const r = await getChatReport(chatSessionId)
    if (aliveRef.current) setReport(r)
  }, [chatSessionId])

  useEffect(() => {
    aliveRef.current = true
    load()
    return () => {
      aliveRef.current = false
    }
  }, [load])

  // 생성 중에만 폴링한다. 완료·실패면 멈춘다.
  const status = report?.reportStatus
  useEffect(() => {
    if (status !== 'PENDING' && status !== 'GENERATING') return
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [status, load])

  async function retry() {
    setRetrying(true)
    try {
      await createChatReport(chatSessionId)
      await load()
    } finally {
      setRetrying(false)
    }
  }

  if (!report) return <ChatReportSkeleton />

  if (status === 'PENDING' || status === 'GENERATING') {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-16" aria-busy="true">
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Icon name="sparkle" size={30} style={{ color: 'var(--bt-color-brand)' }} />
          <b className="bt-h3">대화를 정리하고 있어요</b>
          <p className="bt-body-sm bt-muted">
            주고받은 대화를 처음부터 다시 읽는 중이에요. 준비되면 이 화면에 바로 나타나요.
          </p>
          <Button variant="ghost" onClick={() => navigate('/')}>
            홈으로
          </Button>
        </Card>
      </main>
    )
  }

  if (status === 'FAILED') {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-16">
        <Card>
          <EmptyState
            icon={<Icon name="wrench" size={28} style={{ color: 'var(--bt-color-text-tertiary)' }} />}
            title="피드백을 만들지 못했어요"
            text="정리 중 문제가 생겼어요. 다시 시도하면 저장된 대화로 새로 만들어 드려요."
            action={
              <Button variant="primary" loading={retrying} onClick={retry}>
                다시 시도
              </Button>
            }
          />
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[880px] px-5 py-6">
      {/* 헤더 */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bt-h1">챗봇 연습 피드백</h1>
          <p className="bt-body-sm bt-muted mt-1">
            {formatDate(report.startedAt)} · {STAGE_LABEL[report.stage]}
          </p>
        </div>
        <Badge tone="neutral">텍스트 연습</Badge>
      </div>

      {/* 챗봇은 온도에 반영되지 않는다 — 화상 리포트와 헷갈리지 않게 맨 위에서 못박는다 */}
      <Callout tone="info" className="mb-4">
        챗봇 연습은 사랑의 온도에 반영되지 않아요. 부담 없이 여러 번 시도해 보세요.
      </Callout>

      {/* 대화 요약 */}
      <Card className="mb-4">
        <div className="bt-h3 mb-3">이번 대화</div>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <SummaryStat value={`${report.durationMin}분`} label="대화 시간" />
          <SummaryStat value={report.userMessageCount} label="내가 보낸 메시지" />
          <SummaryStat value={report.totalMessageCount} label="주고받은 메시지" />
        </div>
        {report.practiceGoal && (
          <div className="mt-4 flex items-start gap-2">
            <Icon name="target" size={16} className="mt-1 shrink-0" style={{ color: 'var(--bt-color-action)' }} />
            <div>
              <span className="bt-overline">이 연습의 목표</span>
              <p className="bt-body-sm mt-0.5">{report.practiceGoal}</p>
            </div>
          </div>
        )}
      </Card>

      {report.summaryText && (
        <Card variant="inset" className="mb-4">
          <Hedge />
          <p className="bt-body mt-2">{report.summaryText}</p>
        </Card>
      )}

      {/* 잘한 점 · 다음에 해볼 것 */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row">
        <Card className="sm:flex-1">
          <div className="bt-h3 mb-2 flex items-center gap-2">
            <Icon name="check-circle" size={17} style={{ color: 'var(--bt-color-success)' }} />
            잘한 점 <span className="bt-numeric">{report.strengths.length}</span>
          </div>
          <PointList items={report.strengths} />
        </Card>
        <Card className="sm:flex-1">
          <div className="bt-h3 mb-2 flex items-center gap-2">
            <Icon name="sparkle" size={17} style={{ color: 'var(--bt-color-warning)' }} />
            다음에 해볼 것 <span className="bt-numeric">{report.improvements.length}</span>
          </div>
          <PointList items={report.improvements} />
        </Card>
      </div>

      {/* 반복된 패턴 */}
      {report.patterns.length > 0 && (
        <Card className="mb-4">
          <div className="bt-h3 mb-1">반복된 패턴</div>

          <Cluster gap={6}>
            {report.patterns.map((p) => (
              <TagChip key={p.label}>
                {p.label}
              </TagChip>
            ))}
          </Cluster>
        </Card>
      )}

      {/* 되짚어볼 순간 — 메시지별 피드백과 같은 형식(원문 + 이유 + 대안) */}
      {report.highlights.length > 0 && (
        <Card className="mb-4">
          <div className="bt-h3 mb-3">되짚어볼 순간</div>
          <ul className="flex flex-col gap-4">
            {report.highlights.map((h) => (
              <li key={h.messageId}>
                <HighlightItem highlight={h} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 다음 연습 제안 */}
      {report.nextSuggestions.length > 0 && (
        <Card className="mb-4">
          <div className="bt-h3 mb-3">다음 연습 제안</div>
          <PointList items={report.nextSuggestions} />
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => navigate('/chatbot/persona')}>
          한 번 더 연습하기
        </Button>
        <Button variant="secondary" onClick={() => navigate('/matching')}>
          실사용자 매칭 해보기
        </Button>
      </div>
    </main>
  )
}

/* ── 조각 ──────────────────────────────────────────────── */

function SummaryStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="bt-numeric" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
        {value}
      </span>
      <span className="bt-caption bt-muted">{label}</span>
    </div>
  )
}

/** 목록은 실제 `<ul><li>` 로 그린다 — 가운뎃점 문단은 스크린리더에서 목록이 아니다. */
function PointList({ items }: { items: readonly string[] }) {
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

function HighlightItem({ highlight }: { highlight: ChatHighlight }) {
  return (
    <div className="flex flex-col gap-2">
      <blockquote
        className="bt-body-sm m-0 rounded-[var(--bt-radius-lg)] px-3 py-2.5"
        style={{ background: 'var(--bt-color-surface-sunken)' }}
      >
        {highlight.userText}
      </blockquote>
      <p className="bt-caption bt-muted">{highlight.comment}</p>
      {highlight.suggestion && (
        <p className="bt-body-sm flex items-start gap-2" style={{ color: 'var(--bt-color-success)' }}>
          <Icon name="bulb" size={16} className="mt-0.5 shrink-0" />
          <span>“{highlight.suggestion}”</span>
        </p>
      )}
    </div>
  )
}

function ChatReportSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[880px] px-5 py-6" aria-busy="true">
      <Skeleton width={240} height={32} />
      <Card className="mt-5">
        <Skeleton height={72} />
      </Card>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <Card className="sm:flex-1">
          <Skeleton height={96} />
        </Card>
        <Card className="sm:flex-1">
          <Skeleton height={96} />
        </Card>
      </div>
    </main>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { dateStyle: 'long' })
}
