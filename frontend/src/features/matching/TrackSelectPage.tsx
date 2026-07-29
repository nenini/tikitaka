import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, Icon } from '@/components'
import type { IconName } from '@/components'
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
          동시에 진행할 수 있는 실사용자 매칭은 1개입니다. AI 화상·챗봇은 대기 큐를 유지한 채 이용할 수
          있어요.
        </p>
      </header>

      {/* 카드 내부를 [헤더 / 핵심 3개 / 안내+CTA] 3행 그리드로 고정해 3열의 CTA 라인을 맞춘다 */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* 실사용자 — 추천 */}
        <TrackCard
          icon="user"
          badge={<Badge tone="info">추천</Badge>}
          title="실사용자 화상 세션"
          subtitle="실제 사람과 30분 대화"
          recommended
          facts={[
            { icon: 'clock', label: '30분 · 매칭까지 대기' },
            { icon: 'sparkle', label: '표정 + 대화 코칭' },
            { icon: 'heart', label: '상호 평가 · 연락처 교환 가능' },
          ]}
          note="노쇼·직전 취소 시 패널티가 있어요."
          cta={
            <Button variant="primary" block loading={registering} onClick={enterQueue}>
              대기 큐 등록
            </Button>
          }
        />

        {/* AI 화상 */}
        <TrackCard
          icon="bot"
          title="AI 화상 연습"
          subtitle="음성(TTS) 상대 · 내 얼굴만 표시"
          facts={[
            { icon: 'clock', label: '10~15분 · 즉시 시작' },
            { icon: 'sparkle', label: '대화 코칭 + 표정 코칭' },
            { icon: 'close', label: '상호 평가·연락처 없음', muted: true },
          ]}
          note={
            voiceConsented
              ? '음성 분석 동의가 필요해요.'
              : '음성 분석에 동의해야 이용할 수 있어요.'
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
          icon="chat"
          title="AI 챗봇 대화"
          subtitle="텍스트 전용 · 소개팅 전/후"
          facts={[
            { icon: 'clock', label: '24시간 · 즉시 시작' },
            { icon: 'sparkle', label: '말투 페르소나 · 문장 코칭' },
            { icon: 'close', label: '화상·온도 반영 없음', muted: true },
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

/**
 * 카드에 올릴 사실 한 줄. 트랙당 **3개로 고정**한다 —
 * 항목을 늘리면 3열 카드가 서로 다른 높이가 되고, 사용자는 어차피 다 읽지 않는다.
 */
interface TrackFact {
  icon: IconName
  label: string
  /** 이 트랙에 **없는** 기능. 색이 아니라 아이콘(×)과 밝기로 구분한다 */
  muted?: boolean
}

// note 는 현재 렌더하지 않는다(아래 주석 처리된 <p> 참고). 호출부의 문구는 그대로 두고
// 여기서 구조 분해만 하지 않아, 다시 켤 때 값을 새로 채워 넣지 않아도 되게 남겨둔다.
function TrackCard({
  icon,
  badge,
  title,
  subtitle,
  facts,
  cta,
  recommended = false,
}: {
  icon: IconName
  badge?: React.ReactNode
  title: string
  subtitle: string
  facts: readonly TrackFact[]
  note: string
  cta: React.ReactNode
  recommended?: boolean
}) {
  return (
    <Card
      // 3행 고정 그리드: 사실 목록 길이가 달라도 세 카드의 CTA 가 같은 줄에 선다
      className="grid grid-rows-[auto_1fr_auto] gap-4"
      style={
        recommended
          ? { outline: '2px solid var(--bt-color-action)', outlineOffset: '-2px' }
          : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <span
            className="grid h-11 w-11 place-items-center rounded-[var(--bt-radius-lg)]"
            style={{ background: 'var(--bt-color-action-subtle)', color: 'var(--bt-color-action)' }}
          >
            <Icon name={icon} size={24} />
          </span>
          {badge}
        </div>
        <div>
          <b className="bt-h3">{title}</b>
          <p className="bt-body-sm bt-muted mt-0.5">{subtitle}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {facts.map((f) => (
          <li key={f.label} className="bt-body-sm flex items-start gap-2">
            <Icon
              name={f.icon}
              size={16}
              className="mt-0.5 shrink-0"
              style={{ color: f.muted ? 'var(--bt-color-text-tertiary)' : 'var(--bt-color-success)' }}
            />
            <span className={f.muted ? 'bt-muted' : undefined}>{f.label}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        {/* <p className="bt-caption bt-muted">{note}</p> */}
        {cta}
      </div>
    </Card>
  )
}
