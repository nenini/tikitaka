import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, Cluster, TagChip } from '@/components'
import { createRealMatchRequest } from './api'

/**
 * W-08b 매칭 트랙 선택 (MATCH-01, FE-B).
 * 트랙 3분기: 실사용자 화상(대기 큐) · AI 화상 · AI 챗봇.
 * 규칙: 동시 진행 매칭 1개 · AI화상/챗봇을 이용해도 대기 큐는 유지(‘큐 이탈’로만 해제).
 * 음성 미동의 사용자는 AI 화상 카드를 비활성 + 챗봇 유도.
 */
export function TrackSelectPage() {
  const navigate = useNavigate()
  const [registering, setRegistering] = useState(false)

  // TODO(AUTH 연동): user_consents VOICE 동의 여부. 통합 필수 동의로 충족되면 true.
  const voiceConsented = true

  async function enterQueue() {
    if (registering) return
    setRegistering(true)
    try {
      const req = await createRealMatchRequest()
      navigate(`/matching/queue/${req.matchRequestId}`)
    } finally {
      setRegistering(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1040px] px-5 py-6">
      <header className="mb-5">
        <h1 className="bt-h1">어떤 상대와 연습할까요?</h1>
        <p className="bt-body bt-muted mt-1">
          동시에 진행할 수 있는 매칭은 <b>1개</b>입니다. AI 화상·챗봇은 대기 큐를 유지한 채 이용할 수 있어요.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* 실사용자 — 추천 */}
        <TrackCard
          emoji="🧑"
          badge={<Badge tone="info">추천</Badge>}
          title="실사용자 화상 세션"
          subtitle="실제 사람과 30분 대화"
          recommended
          meta={[
            { label: '⏱ 30분' },
            { label: '대기 필요' },
            { label: '표정 + 대화 코칭', tone: 'ok' },
            { label: '상호 평가', tone: 'ok' },
            { label: '연락처 교환 가능', tone: 'ok' },
          ]}
          note="조건에 맞는 상대를 찾을 때까지 대기해요. 노쇼·직전 취소 시 패널티가 있습니다."
          cta={
            <Button variant="primary" block loading={registering} onClick={enterQueue}>
              대기 큐 등록
            </Button>
          }
        />

        {/* AI 화상 — P1 정식 */}
        <TrackCard
          emoji="🤖"
          badge={<Badge tone="warning">P1 · AI 화상</Badge>}
          title="AI 화상 연습"
          subtitle="음성(TTS) 상대 · 내 얼굴만 표시"
          meta={[
            { label: '⏱ 10~15분' },
            { label: '즉시 시작', tone: 'ok' },
            { label: '대화 코칭', tone: 'ok' },
            { label: '카메라 시 표정 코칭' },
            { label: '상호 평가 없음', tone: 'no' },
            { label: '연락처 없음', tone: 'no' },
          ]}
          note={
            voiceConsented
              ? '음성 분석 동의가 필수입니다. 대기 큐를 유지한 채 연습할 수 있어요.'
              : '음성 분석에 동의해야 AI 화상을 이용할 수 있어요. 지금은 챗봇으로 연습해 보세요.'
          }
          cta={
            <Button
              variant="secondary"
              block
              disabled={!voiceConsented}
              onClick={() => navigate('/ai-video/setup')}
            >
              AI 화상 시작
            </Button>
          }
        />

        {/* AI 챗봇 — 큐 유지(결정: 명세 규칙) */}
        <TrackCard
          emoji="💬"
          title="AI 챗봇 대화"
          subtitle="텍스트 전용 · 소개팅 전/후"
          meta={[
            { label: '텍스트' },
            { label: '24시간', tone: 'ok' },
            { label: '말투 페르소나' },
            { label: '화상 없음', tone: 'no' },
            { label: '온도 반영 없음', tone: 'no' },
          ]}
          note="대기 큐를 유지한 채 이용할 수 있어요."
          cta={
            <Button variant="secondary" block onClick={() => navigate('/chatbot/persona')}>
              챗봇 시작
            </Button>
          }
        />
      </div>

      {!voiceConsented && (
        <Callout tone="info" className="mt-4">
          AI 화상은 음성 분석 동의가 필요해요. 마이페이지에서 동의하면 바로 이용할 수 있어요.
        </Callout>
      )}
    </main>
  )
}

/* ── 트랙 카드 ── */

interface MetaChip {
  label: string
  tone?: 'neutral' | 'ok' | 'no'
}

function TrackCard({
  emoji,
  badge,
  title,
  subtitle,
  meta,
  note,
  cta,
  recommended = false,
}: {
  emoji: string
  badge?: React.ReactNode
  title: string
  subtitle: string
  meta: MetaChip[]
  note: string
  cta: React.ReactNode
  recommended?: boolean
}) {
  return (
    <Card
      className="flex flex-col gap-3"
      style={
        recommended
          ? { outline: '2px solid var(--bt-color-action)', outlineOffset: '-2px' }
          : undefined
      }
    >
      <div className="flex items-start justify-between">
        <span style={{ fontSize: 30 }} aria-hidden="true">
          {emoji}
        </span>
        {badge}
      </div>

      <div>
        <b className="bt-h3">{title}</b>
        <p className="bt-body-sm bt-muted mt-0.5">{subtitle}</p>
      </div>

      <Cluster gap={6}>
        {meta.map((c, i) =>
          c.tone === 'ok' ? (
            <Badge key={i} tone="success">
              {c.label}
            </Badge>
          ) : c.tone === 'no' ? (
            <Badge key={i} tone="neutral">
              {c.label}
            </Badge>
          ) : (
            <TagChip key={i}>{c.label}</TagChip>
          ),
        )}
      </Cluster>

      {/* 하단 고정: 안내 + CTA */}
      <p className="bt-caption bt-muted mt-auto pt-1">{note}</p>
      {cta}
    </Card>
  )
}
