import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Hedge,
  Icon,
  IconButton,
  Modal,
  Spinner,
} from '@/components'
import { cn } from '@/shared/lib/cn'
import { getMessageFeedback, requestSuggestions } from './api'
import { PERSONALITY_DESC, PERSONALITY_LABEL, STAGE_DESC, STAGE_LABEL } from './types'
import type { AiChatSession, ChatMessage, MessageFeedback, SuggestedSentence } from './types'

/* ── 페르소나 요약 패널 ─────────────────────────────────
   데스크탑에서는 좌측 사이드바, 모바일에서는 헤더의 '대화 정보' 시트로 들어간다.
   ⚠️ 표시 항목은 명세 §7.2(v4·A18) 그대로 **연습 단계 · 성향** 둘뿐이다.
      말투·대화 난이도·반응 정도는 제거된 항목이라 다시 그리지 않는다.
   ⚠️ systemPrompt 는 클라이언트에 내려오지 않는다. */

export interface PersonaPanelProps {
  session: AiChatSession
  onToggleProactive: (enabled: boolean) => void
  onEnd: () => void
  /** 이미 카드/모달 안이라 카드 표면이 필요 없을 때 (모바일 시트) */
  plain?: boolean
  className?: string
}

export function PersonaPanel({ session, onEnd, plain, className }: PersonaPanelProps) {
  const { persona } = session
  const ended = session.status === 'COMPLETED'

  return (
    <aside className={cn(!plain && 'bt-card', className)}>
      <div className="flex h-full flex-col gap-4">
        <div>
          <span className="bt-overline">대화 상대</span>
          <div className="mt-2 flex items-center gap-3">
            <Avatar name={persona.name} fallback={persona.emoji ?? undefined} />
            <div className="min-w-0">
              <b className="bt-body-sm block truncate">{persona.name}</b>
              <span className="bt-caption">텍스트 전용 연습</span>
            </div>
          </div>
        </div>

        <hr className="border-line m-0 border-t" />

        {/* 페르소나 = 연습 단계 + 성향 (§7.2) */}
        <div className="flex flex-col gap-3">
          <SettingRow
            label="연습 단계"
            value={STAGE_LABEL[session.stage]}
            desc={STAGE_DESC[session.stage]}
          />
          <SettingRow
            label="성향"
            value={PERSONALITY_LABEL[persona.personality]}
            desc={PERSONALITY_DESC[persona.personality]}
          />
        </div>

        <hr className="border-line m-0 border-t" />

        <div>
          <span className="bt-overline">이 연습의 목표</span>
          <p className="bt-body-sm mt-1">{session.practiceGoal ?? '이번 대화는 자유 연습이에요.'}</p>
        </div>
        {/* 
        <hr className="border-line m-0 border-t" />

        <div>
          <Switch
            checked={session.proactiveMessageEnabled}
            disabled={ended}
            onChange={(e) => onToggleProactive(e.currentTarget.checked)}
            label="선톡 알림 받기"
          />
          <p className="bt-caption mt-2">
            12시간 동안 답장이 없으면 <b>1회만</b> 먼저 말을 걸어요. 반복해서 보내지 않아요.
          </p>
          <ProactiveScheduleTable />
          {session.proactiveMessageSentAt && (
            <p className="bt-caption mt-2">이번 대화의 선톡은 이미 보냈어요(재발송 없음).</p>
          )}
        </div> */}

        <Button variant="ghost" size="sm" block disabled={ended} onClick={onEnd} className="mt-auto">
          대화 종료
        </Button>
      </div>
    </aside>
  )
}

/** 라벨 + 선택값 + 한 줄 설명. 설정값을 '읽기 전용'으로 되짚어 준다. */
function SettingRow({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div>
      <span className="bt-overline">{label}</span>
      <div className="mt-1 flex items-baseline gap-2">
        <b className="bt-body-sm">{value}</b>
        <span className="bt-caption truncate">{desc}</span>
      </div>
    </div>
  )
}

/* ── 흐름 구분선 ───────────────────────────────────────── */

export function DayDivider({ label }: { label: string }) {
  return (
    <div className="bt-chat-divider" role="separator" aria-label={label}>
      {label}
    </div>
  )
}

/** 선톡 구분 표시 — 사용자가 부른 답이 아니라 챗봇이 먼저 건 말이라는 걸 알린다. */
export function ProactiveDivider() {
  return (
    <div className="bt-chat-divider">
      <Badge tone="warning">선톡</Badge>
      <span>12시간 무응답 · 1회 한정</span>
    </div>
  )
}

/* ── 입력창 ────────────────────────────────────────────── */

export interface ComposerProps {
  value: string
  onChange: (next: string) => void
  onSend: () => void
  /** 전송 중(스트리밍 포함) — 중복 전송을 막는다 */
  busy: boolean
  disabled?: boolean
}

/**
 * 메시지 입력창. Enter 전송 / Shift+Enter 줄바꿈.
 * ⚠️ 한글 IME 조합 중의 Enter 는 전송이 아니라 **조합 확정**이다 — composing 중에는 보내지 않는다.
 */
export function Composer({ value, onChange, onSend, busy, disabled }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const composing = useRef(false)

  // 입력량에 따라 높이를 늘린다(최대 5줄). 값이 비면 한 줄로 되돌린다.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [value])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (composing.current || e.nativeEvent.isComposing) return
    e.preventDefault()
    onSend()
  }

  return (
    <div className="flex items-end gap-2">
      <label htmlFor="chat-composer" className="bt-sr-only">
        메시지 입력
      </label>
      <textarea
        id="chat-composer"
        ref={ref}
        rows={1}
        className="bt-input flex-1 resize-none"
        style={{ borderRadius: 'var(--bt-radius-xl)' }}
        placeholder={disabled ? '종료된 대화예요' : '메시지를 입력하세요'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onKeyDown={handleKeyDown}
      />
      {/* state="on" = 액션색 채움. 44px 원형이라 터치 타깃 기준(§8)을 그대로 만족한다 */}
      <IconButton
        icon="send"
        state="on"
        aria-label="메시지 보내기"
        disabled={disabled || busy || value.trim().length === 0}
        onClick={onSend}
      />
    </div>
  )
}

/* ── 메시지별 피드백 · 대체 문장 ───────────────────────── */

export interface FeedbackModalProps {
  /** 백엔드 sessionId (Long) */
  chatSessionId: number
  /** 열려 있는 대상 메시지(내 메시지). null 이면 닫힘 */
  message: ChatMessage | null
  onClose: () => void
  /** 추천 문장을 입력창으로 가져가기 */
  onUseSuggestion: (text: string) => void
}

/**
 * 내 메시지 하나에 대한 코칭. 원칙 1(점수 없음) · 원칙 3(단정하지 않음) · §7.4 화법을 따른다.
 * 대체 문장은 필요할 때만 요청한다(POST — 생성 비용이 있는 호출이다).
 */
export function FeedbackModal({ chatSessionId, message, onClose, onUseSuggestion }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState<MessageFeedback | null>(null)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestedSentence[] | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    if (!message) return
    let alive = true
    setLoading(true)
    setFeedback(null)
    setSuggestions(null)
    getMessageFeedback(chatSessionId, message.messageId)
      .then((f) => alive && setFeedback(f))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [chatSessionId, message])

  async function loadSuggestions() {
    if (!message) return
    setSuggesting(true)
    try {
      setSuggestions(await requestSuggestions(chatSessionId, message.messageId))
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <Modal open={message != null} onClose={onClose} title="이 메시지 피드백">
      <blockquote className="bt-body-sm bg-surface-sunken m-0 rounded-[var(--bt-radius-md)] p-3">
        {message?.text}
      </blockquote>

      <div className="mt-3">
        <Hedge />
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner label="피드백을 불러오는 중" />
        </div>
      ) : (
        feedback && (
          <div className="mt-4 flex flex-col gap-4">
            <FeedbackList title="좋았던 점" icon="check-circle" tone="success" items={feedback.strengths} />
            <FeedbackList
              title="다음에 해볼 것"
              icon="sparkle"
              tone="warning"
              items={feedback.improvements}
            />
            {feedback.comment && <Callout tone="info">{feedback.comment}</Callout>}
          </div>
        )
      )}

      <div className="mt-4">
        {suggestions ? (
          <div className="flex flex-col gap-2">
            <span className="bt-overline">이렇게 말해볼 수도 있어요</span>
            {suggestions.map((s) => (
              <div key={s.text} className="bt-card bt-card--inset flex flex-col gap-2">
                <p className="bt-body-sm m-0">{s.text}</p>
                {s.reason && <span className="bt-caption">{s.reason}</span>}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onUseSuggestion(s.text)
                    onClose()
                  }}
                >
                  입력창에 넣기
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Button variant="tonal" size="sm" block loading={suggesting} onClick={loadSuggestions}>
            <Icon name="sparkle" size={15} /> 대체 문장 추천 받기
          </Button>
        )}
      </div>
    </Modal>
  )
}

function FeedbackList({
  title,
  icon,
  tone,
  items,
}: {
  title: string
  icon: 'check-circle' | 'sparkle'
  tone: 'success' | 'warning'
  items: string[]
}) {
  if (items.length === 0) return null
  return (
    <section>
      <h3 className="bt-body-sm m-0 flex items-center gap-2 font-semibold">
        <span style={{ color: tone === 'success' ? 'var(--bt-color-success)' : 'var(--bt-color-warning)' }}>
          <Icon name={icon} size={16} />
        </span>
        {title}
      </h3>
      <ul className="bt-body-sm mt-2 flex list-disc flex-col gap-1 pl-5">
        {items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </section>
  )
}

/* ── 작은 조각 ─────────────────────────────────────────── */

/** 대화 헤더. 모바일에서는 여기가 페르소나 패널을 대신한다(단계·성향 요약 + '상세'). */
export function ChatHeader({
  session,
  right,
  style,
}: {
  session: AiChatSession
  right?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className="border-line flex items-center gap-3 border-b px-4 py-3" style={style}>
      <Avatar size="sm" name={session.persona.name} fallback={session.persona.emoji ?? undefined} />
      <div className="min-w-0 flex-1">
        <b className="bt-body-sm block truncate">{session.persona.name}</b>
        <span className="bt-caption">
          {STAGE_LABEL[session.stage]} · {PERSONALITY_LABEL[session.persona.personality]}
        </span>
      </div>
      {session.status === 'COMPLETED' && <Badge>종료됨</Badge>}
      {right}
    </div>
  )
}
