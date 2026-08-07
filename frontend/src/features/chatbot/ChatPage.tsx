import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Callout,
  Card,
  ChatBubble,
  EmptyState,
  Modal,
  Skeleton,
  TypingIndicator,
} from '@/components'
import {
  cancelAiResponse,
  completeChatSession,
  createChatReport,
  getChatSessionDetail,
  getCurrentChatSession,
  rememberPersonaName,
  retryAiReply,
  sendMessageAndStream,
  setProactiveMessageEnabled,
} from './api'
import { errorMessageOf } from '@/shared/api/envelope'
import { cn } from '@/shared/lib/cn'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { ChatHeader, Composer, DayDivider, FeedbackModal, PersonaPanel, ProactiveDivider } from './parts'
import { formatDayLabel, formatTime, needsDayDivider } from './format'
import type { AiChatSession, ChatMessage } from './types'


export function ChatPage() {
  const { chatSessionId: idParam } = useParams()
  const navigate = useNavigate()
  /** 대화만 남기는 모바일 레이아웃 여부. Tailwind `lg`(1024px)와 같은 경계를 쓴다 */
  const compact = useMediaQuery('(max-width: 1023px)')

  const [session, setSession] = useState<AiChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [noSession, setNoSession] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  /** 스트리밍 중인 AI 답변. null 이면 스트리밍 아님, '' 이면 아직 첫 글자 전(타이핑 표시) */
  const [streamText, setStreamText] = useState<string | null>(null)

  const [feedbackTarget, setFeedbackTarget] = useState<ChatMessage | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [ending, setEnding] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  /** 사용자가 위로 올려 과거를 읽는 중이면 자동 스크롤을 하지 않는다 */
  const stickToBottom = useRef(true)

  /* ── 세션 · 메시지 로드 ──
     백엔드 상세 응답이 세션과 메시지를 함께 주므로 호출이 한 번이다. */
  useEffect(() => {
    let alive = true
    setLoading(true)

    void (async () => {
      try {
        if (!idParam) {
          // `/chatbot` 진입 — 진행 중 세션을 찾아 URL 에 id 를 남긴다(새로고침·뒤로가기 대비).
          const current = await getCurrentChatSession()
          if (!alive) return
          if (!current) {
            setNoSession(true)
            setLoading(false)
            return
          }
          navigate(`/chatbot/${current.chatSessionId}`, { replace: true })
          return
        }

        const chatSessionId = Number(idParam)
        if (!Number.isFinite(chatSessionId) || chatSessionId <= 0) {
          setNoSession(true)
          setLoading(false)
          return
        }

        const detail = await getChatSessionDetail(chatSessionId)
        if (!alive) return

        /*
         * 끝난 대화의 주소로 **들어오는** 것을 막는다(W-73 과 같은 규칙).
         *
         * ⚠️ 여기서만 판정한다 — 최초 로드 시점의 상태만 본다. 화면에 머무는 동안
         *    상태가 바뀌는 경우(사용자가 방금 `종료` 를 누른 흐름)까지 튕기면
         *    "대화를 마쳤어요" 안내를 볼 새도 없이 화면이 갈아엎힌다.
         *
         * 중단된 대화(CANCELLED)는 종합 피드백이 없으므로 홈으로 보낸다.
         */
        if (detail.session.status !== 'ACTIVE') {
          navigate(
            detail.session.status === 'COMPLETED' ? `/chatbot/${chatSessionId}/report` : '/',
            { replace: true },
          )
          return
        }

        setSession(detail.session)
        setMessages(detail.messages)
        setLoading(false)
      } catch (loadError) {
        if (!alive) return
        setError(errorMessageOf(loadError, '대화를 불러오지 못했어요.'))
        setNoSession(true)
        setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [idParam, navigate])

  // 화면을 떠나면 진행 중인 스트림을 끊는다
  useEffect(() => () => abortRef.current?.abort(), [])

  /* ── 자동 스크롤 ── */
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el || !stickToBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [messages, streamText, loading])

  /* ── 전송 → 스트리밍 수신 ──
     백엔드는 POST 하나로 사용자 메시지 저장 + AI 스트리밍을 함께 처리한다
     (사용자 메시지 전용 엔드포인트가 없다). */
  async function handleSend() {
    const text = draft.trim()
    if (!session || !text || busy || session.status !== 'ACTIVE') return

    setDraft('')
    setError(null)
    setBusy(true)
    stickToBottom.current = true

    // 낙관적 렌더 — 서버가 준 id 로 나중에 교체한다.
    const optimisticId = `local-${Date.now()}`
    const sentAt = new Date().toISOString()
    setMessages((prev) => [
      ...prev,
      { messageId: optimisticId, sender: 'USER', text, createdAt: sentAt },
    ])

    setStreamText('')
    const controller = new AbortController()
    abortRef.current = controller

    let acc = ''
    try {
      const reply = await sendMessageAndStream(session.chatSessionId, text, {
        onDelta: (chunk) => {
          acc += chunk
          setStreamText(acc)
        },
        onUserMessageId: (userMessageId) => {
          setMessages((prev) =>
            prev.map((m) => (m.messageId === optimisticId ? { ...m, messageId: String(userMessageId) } : m)),
          )
        },
        // 서버는 첫 응답에서 페르소나를 고른다 — 표시명을 그때 알게 된다.
        onPersona: ({ personaKey, displayName }) => {
          rememberPersonaName(session.chatSessionId, displayName)
          setSession((s) =>
            s ? { ...s, persona: { ...s.persona, personaId: personaKey, name: displayName } } : s,
          )
        },
        signal: controller.signal,
      })

      const replyText = reply.text || acc
      if (replyText) {
        setMessages((prev) => [
          ...prev,
          {
            messageId: reply.aiMessageId != null ? String(reply.aiMessageId) : `ai-${Date.now()}`,
            sender: 'AI',
            text: replyText,
            createdAt: new Date().toISOString(),
          },
        ])
      }
      setSession((s) => (s ? { ...s, lastUserMessageAt: sentAt, aiResponseState: 'IDLE' } : s))
    } catch (sendError) {
      if (controller.signal.aborted) {
        // 사용자가 취소했다 — 보낸 메시지는 서버에 남아 있으니 지우지 않는다.
        setSession((s) => (s ? { ...s, aiResponseState: 'CANCELLED' } : s))
        return
      }
      setError(errorMessageOf(sendError, '메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.'))
      setMessages((prev) => prev.filter((m) => m.messageId !== optimisticId))
      setDraft(text) // 쓴 글을 잃지 않게 되돌려준다
    } finally {
      abortRef.current = null
      setStreamText(null)
      setBusy(false)
    }
  }

  /** 진행 중인 AI 응답 취소 — 서버 상태도 CANCELLED 로 기록한다. */
  async function handleCancelReply() {
    if (!session) return
    abortRef.current?.abort()
    await cancelAiResponse(session.chatSessionId).catch(() => {
      /* 취소할 응답이 없으면 409 — 이미 끝난 것이니 무시 */
    })
  }

  /** 실패·취소된 응답 재시도. 사용자 메시지를 다시 보내지 않는다. */
  async function handleRetryReply() {
    if (!session?.pendingUserMessageId || busy) return
    setError(null)
    setBusy(true)
    setStreamText('')
    const controller = new AbortController()
    abortRef.current = controller

    let acc = ''
    try {
      const reply = await retryAiReply(session.chatSessionId, session.pendingUserMessageId, {
        onDelta: (chunk) => {
          acc += chunk
          setStreamText(acc)
        },
        signal: controller.signal,
      })
      const replyText = reply.text || acc
      if (replyText) {
        setMessages((prev) => [
          ...prev,
          {
            messageId: reply.aiMessageId != null ? String(reply.aiMessageId) : `ai-${Date.now()}`,
            sender: 'AI',
            text: replyText,
            createdAt: new Date().toISOString(),
          },
        ])
      }
      setSession((s) => (s ? { ...s, aiResponseState: 'IDLE', pendingUserMessageId: null } : s))
    } catch (retryError) {
      if (!controller.signal.aborted) {
        setError(errorMessageOf(retryError, '다시 시도하지 못했어요.'))
      }
    } finally {
      abortRef.current = null
      setStreamText(null)
      setBusy(false)
    }
  }

  /* ── 선톡 알림 설정 ── */
  async function handleToggleProactive(enabled: boolean) {
    if (!session) return
    setSession({ ...session, proactiveMessageEnabled: enabled })
    await setProactiveMessageEnabled(session.chatSessionId, enabled)
  }

  /* ── 종료 → 종합 피드백 생성 ── */
  async function handleEnd() {
    if (!session) return
    setEnding(true)
    try {
      // 응답 생성 중이면 서버가 종료를 막는다(409) → 먼저 취소한다.
      abortRef.current?.abort()
      if (session.aiResponseState === 'PROCESSING') {
        await cancelAiResponse(session.chatSessionId).catch(() => {})
      }
      const next = await completeChatSession(session.chatSessionId)
      // 종합 피드백 생성 API 는 아직 백엔드에 없다(no-op).
      await createChatReport(session.chatSessionId)
      setSession(next)
      setEndOpen(false)
      setPersonaOpen(false)
    } catch (endError) {
      setError(errorMessageOf(endError, '대화를 종료하지 못했어요.'))
    } finally {
      setEnding(false)
    }
  }

  /* ── 렌더 ── */
  if (noSession) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-16">
        <Card>
          <EmptyState
            title="진행 중인 대화가 없어요"
            text="AI 챗봇 연습은 상대 설정부터 시작해요. 텍스트로만 진행되는 연습입니다."
            action={<Button onClick={() => navigate('/chatbot/persona')}>상대 설정하기</Button>}
          />
        </Card>
      </main>
    )
  }

  // ACTIVE 가 아니면 전부 '끝난 대화'다. COMPLETED 만 보면 중단된 대화(CANCELLED)에
  // 입력창이 그대로 그려져, 쳐 보고 나서야 못 보낸다는 걸 알게 된다.
  const ended = session != null && session.status !== 'ACTIVE'
  const completed = session?.status === 'COMPLETED'
  const personaName = session?.persona.name ?? '챗봇'

  return (
    <main
      className={cn(
        'flex w-full',
        // 모바일: 대화가 화면을 그대로 채운다(카드·여백 없음)
        // 데스크탑: 페르소나 패널 + 대화 카드 2단
        compact ? 'h-[100dvh]' : 'mx-auto h-[100dvh] max-w-[960px] gap-4 px-5 py-6',
      )}
    >
      {!compact && session && (
        <PersonaPanel
          className="w-[280px] shrink-0"
          session={session}
          onToggleProactive={handleToggleProactive}
          onEnd={() => setEndOpen(true)}
        />
      )}

      {/* 대화 컬럼. 데스크탑에서만 카드 표면을 두른다 */}
      <div
        className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', !compact && 'bt-card')}
        style={!compact ? { padding: 0 } : undefined}
      >
        {session && (
          <>
            <ChatHeader
              session={session}
              style={compact ? { paddingTop: 'max(12px, env(safe-area-inset-top))' } : undefined}
              right={
                // 데스크탑에는 왼쪽 패널에 같은 내용이 이미 있다 — 모바일에서만 시트로 연다
                compact ? (
                  <Button variant="ghost" size="sm" onClick={() => setPersonaOpen(true)}>
                    상세
                  </Button>
                ) : undefined
              }
            />
            {compact && session.practiceGoal && (
              <div className="border-line flex items-center gap-2 border-b px-4 py-2">
                <span className="bt-overline shrink-0">목표</span>
                <span className="bt-caption truncate">{session.practiceGoal}</span>
              </div>
            )}
          </>
        )}

        <div
          ref={listRef}
          onScroll={handleScroll}
          role="log"
          aria-label="대화 내용"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        >
          {loading ? (
            <LoadingBubbles />
          ) : messages.length === 0 ? (
            <p className="bt-body-sm bt-muted m-auto max-w-[28ch] text-center">
              먼저 가볍게 인사를 건네볼까요?<br /> 편하게 쓰셔도 돼요.
            </p>
          ) : (
            messages.map((message, i) => (
              <MessageItem
                key={message.messageId}
                message={message}
                prevCreatedAt={messages[i - 1]?.createdAt}
                personaName={personaName}
              />
            ))
          )}

          {/* 스트리밍 중인 답변. 글자가 늘어날 때마다 읽히면 소음이 되므로 완성 전에는 알리지 않는다 */}
          {streamText === '' && <TypingIndicator name={personaName} />}
          {streamText ? (
            <ChatBubble side="them" senderLabel={personaName} aria-hidden="true">
              {streamText}
            </ChatBubble>
          ) : null}
        </div>

        <div
          className="border-line flex flex-col gap-2 border-t px-4 py-3"
          // 모바일에서 화면을 다 덮으므로 홈바 영역만큼 아래를 띄운다
          style={compact ? { paddingBottom: 'max(12px, env(safe-area-inset-bottom))' } : undefined}
        >
          {error && <Callout tone="danger">{error}</Callout>}

          {/* 응답이 실패·취소로 멈춰 있으면 사용자 메시지를 다시 보내지 않고 재시도한다 */}
          {!ended &&
            session?.pendingUserMessageId != null &&
            (session.aiResponseState === 'FAILED' || session.aiResponseState === 'CANCELLED') && (
              <Callout tone="warning">
                답장이 도착하지 않았어요. 보낸 메시지는 그대로 남아 있어요.
                <div className="mt-2">
                  <Button variant="secondary" size="sm" leadingIcon="refresh" onClick={handleRetryReply}>
                    다시 시도
                  </Button>
                </div>
              </Callout>
            )}

          {/* 스트리밍 중에는 멈출 수 있어야 한다 — 긴 답변을 기다리게만 두지 않는다 */}
          {busy && streamText != null && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={handleCancelReply}>
                답변 멈추기
              </Button>
            </div>
          )}

          {ended ? (
            <Callout tone="info">
              {completed
                ? '대화를 마쳤어요. 주고받은 대화를 정리해 종합 피드백을 만들고 있어요.'
                : '중단된 대화예요. 이어서 대화하거나 피드백을 받을 수는 없어요.'}
              <div className="mt-2 flex flex-wrap gap-2">
                {/* 중단된 대화에는 종합 피드백이 없다 — 버튼을 그리면 빈 화면으로 보낸다 */}
                {completed && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/chatbot/${session?.chatSessionId}/report`)}
                  >
                    종합 피드백 보기
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                  홈으로
                </Button>
              </div>
            </Callout>
          ) : (
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={handleSend}
              busy={busy}
              disabled={!session || loading}
            />
          )}
        </div>
      </div>

      {/* 모바일: 페르소나 요약·선톡 설정·종료를 시트로 */}
      <Modal open={personaOpen} onClose={() => setPersonaOpen(false)} title="대화 정보">
        {session && (
          <PersonaPanel
            plain
            session={session}
            onToggleProactive={handleToggleProactive}
            onEnd={() => {
              setPersonaOpen(false)
              setEndOpen(true)
            }}
          />
        )}
      </Modal>

      {/* 종료 확인 */}
      <Modal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        role="alertdialog"
        title="대화를 종료할까요?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>
              계속하기
            </Button>
            {/* 되돌릴 수 없는 액션이라 주 버튼으로 세운다 */}
            <Button variant="primary" loading={ending} onClick={handleEnd}>
              종료하고 피드백 받기
            </Button>
          </>
        }
      >
        종료하면 이 대화에는 더 이상 메시지를 보낼 수 없어요. 대신 대화 전체에 대한 종합 피드백을
        만들어 드려요. 챗봇 연습은 사랑의 온도에 반영되지 않습니다.
      </Modal>

      {session && (
        <FeedbackModal
          chatSessionId={session.chatSessionId}
          message={feedbackTarget}
          onClose={() => setFeedbackTarget(null)}
          onUseSuggestion={setDraft}
        />
      )}
    </main>
  )
}

/**
 * 메시지 한 건 + 앞에 붙는 날짜/선톡 구분.
 *
 * NOTE: 말풍선 아래 '피드백 보기' 버튼은 현재 주석 처리돼 있다. 다시 켤 때는
 *       `onOpenFeedback: () => void` prop 을 복구하고 호출부에서 setFeedbackTarget 을 넘긴다
 *       (FeedbackModal · 피드백/대체문장 API 는 그대로 살아 있다).
 */
function MessageItem({
  message,
  prevCreatedAt,
  personaName,
}: {
  message: ChatMessage
  prevCreatedAt?: string
  personaName: string
}) {
  const mine = message.sender === 'USER'
  return (
    <>
      {needsDayDivider(prevCreatedAt, message.createdAt) && (
        <DayDivider label={formatDayLabel(message.createdAt)} />
      )}
      {message.isProactive && <ProactiveDivider />}
      <ChatBubble
        side={mine ? 'me' : 'them'}
        senderLabel={mine ? '나' : personaName}
        meta={formatTime(message.createdAt)}
      // actions={
      //   mine && message.hasFeedback ? (
      //     <Button variant="ghost" size="sm" onClick={onOpenFeedback}>
      //       피드백 보기
      //     </Button>
      //   ) : undefined
      // }
      >
        {message.text}
      </ChatBubble>
    </>
  )
}

function LoadingBubbles() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton width="62%" height={44} style={{ borderRadius: 'var(--bt-radius-lg)' }} />
      <Skeleton width="48%" height={38} className="self-end" style={{ borderRadius: 'var(--bt-radius-lg)' }} />
      <Skeleton width="70%" height={56} style={{ borderRadius: 'var(--bt-radius-lg)' }} />
    </div>
  )
}
