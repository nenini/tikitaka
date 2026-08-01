import { apiClient } from '@/shared/api/client'
import { tokenStore } from '@/shared/api/tokens'
import { PROACTIVE_QUIET_TO, proactiveMessageAt } from './types'
import type {
  AiChatSession,
  AiPersonaOptions,
  ChatMessage,
  ChatMessagePage,
  ChatReport,
  CreateChatSessionInput,
  MessageFeedback,
  PersonaRecommendation,
  SuggestedSentence,
} from './types'

/**
 * AI 챗봇(AI_CHAT) REST + SSE.
 *
 * 백엔드 미가동 시 데모 폴백을 돌려준다(매칭·대기방과 동일 방침). 실서버가 붙으면 폴백은 안 쓰인다.
 * apiClient.baseURL 이 `/api` 이므로 여기서는 `/v1/...` 부터 적는다.
 *
 *   GET   /api/v1/ai-personas/options                                     상대 설정 옵션 조회(W-10)
 *   POST  /api/v1/ai-personas/recommendations                             조건 기반 페르소나 추천(W-10)
 *   GET   /api/v1/ai-personas/{personaId}                                 페르소나 상세 조회
 *   POST  /api/v1/ai-chat-sessions                                        세션 생성(W-10 '대화 시작')
 *   GET   /api/v1/ai-chat-sessions/{id}                                  세션 조회
 *   GET   /api/v1/ai-chat-sessions/{id}/messages                         메시지 목록
 *   GET   /api/v1/ai-chat-sessions/current                               진행 중 세션
 *   POST  /api/v1/ai-chat-sessions/{id}/messages                         사용자 메시지 전송
 *   SSE   /api/v1/ai-chat-sessions/{id}/messages/stream                  AI 답변 스트리밍
 *   GET   /api/v1/ai-chat-sessions/{id}/messages/{messageId}/feedback     메시지별 피드백
 *   POST  /api/v1/ai-chat-sessions/{id}/messages/{messageId}/suggestions  대체 문장 추천
 *   PATCH /api/v1/ai-chat-sessions/{id}/proactive-message-setting        선톡 알림 설정
 *   POST  /api/v1/ai-chat-sessions/{id}/complete                         세션 종료
 *   POST  /api/v1/ai-chat-sessions/{id}/report                           종합 피드백 생성
 */

const BASE = '/v1/ai-chat-sessions'
const PERSONA_BASE = '/v1/ai-personas'

/* ── 페르소나 설정(W-10) ──────────────────────────────── */

/** 이미 저장된 시·도가 있으면 지역 카드를 건너뛴다(§7.1 "이미 입력했으면 카드를 건너뛴다"). */
export async function getPersonaOptions(): Promise<AiPersonaOptions> {
  try {
    const { data } = await apiClient.get<AiPersonaOptions>(`${PERSONA_BASE}/options`)
    return data
  } catch {
    return { regionCity: null } // 데모: 항상 최초 이용으로 취급
  }
}

/** 조건 기반 추천 — 화면의 초기 선택값을 채우는 용도(사용자가 그 다음 자유롭게 바꿀 수 있다). */
export async function requestPersonaRecommendation(): Promise<PersonaRecommendation> {
  try {
    const { data } = await apiClient.post<PersonaRecommendation>(`${PERSONA_BASE}/recommendations`)
    return data
  } catch {
    return { stage: 'BEFORE_DATE', personality: 'MIDDLE' }
  }
}

/**
 * 챗봇 최초 이용 시 시·도 저장.
 * ⚠️ AI_CHAT 도메인 표에는 없는 엔드포인트다 — 와이어플로우(W-10)의 "PATCH /api/me/profile { regionCity }"
 *    제안을 그대로 썼다. PROFILE 도메인 명세가 나오면 URL을 재확인한다.
 */
export async function saveRegionCity(regionCity: string): Promise<void> {
  try {
    await apiClient.patch('/v1/me/profile', { regionCity })
  } catch {
    /* 데모: 로컬에서만 완료 처리 */
  }
}

/** 세션 생성('대화 시작'). 페르소나(이름·아바타)는 서버가 stage+personality 로 배정한다. */
export async function createChatSession(input: CreateChatSessionInput): Promise<AiChatSession> {
  try {
    const { data } = await apiClient.post<AiChatSession>(BASE, input)
    return data
  } catch {
    const session = demoSession(`demo-${Date.now()}`, input)
    demoSessionStore.set(session.chatSessionId, session)
    return session
  }
}

/* ── 세션 ──────────────────────────────────────────────── */

export async function getChatSession(chatSessionId: string): Promise<AiChatSession> {
  try {
    const { data } = await apiClient.get<AiChatSession>(`${BASE}/${chatSessionId}`)
    return data
  } catch {
    return demoSessionStore.get(chatSessionId) ?? demoSession(chatSessionId)
  }
}

/** 진행 중인 세션. 없으면 null (→ 페르소나 설정 W-10 으로 보낸다). */
export async function getCurrentChatSession(): Promise<AiChatSession | null> {
  try {
    const { data } = await apiClient.get<AiChatSession | null>(`${BASE}/current`)
    return data ?? null
  } catch {
    return demoSession('demo')
  }
}

/** 종료. 종료된 세션에는 더 이상 메시지를 보낼 수 없다. */
export async function completeChatSession(chatSessionId: string): Promise<AiChatSession> {
  try {
    const { data } = await apiClient.post<AiChatSession>(`${BASE}/${chatSessionId}/complete`)
    return data
  } catch {
    const base = await getChatSession(chatSessionId)
    const next: AiChatSession = { ...base, status: 'COMPLETED', completedAt: new Date().toISOString() }
    demoSessionStore.set(chatSessionId, next)
    return next
  }
}

/*   GET   /api/v1/ai-chat-sessions/{id}/report                          종합 피드백 조회 */

/** 종합 피드백 생성 요청(비동기 생성 → 준비되면 종합 피드백 화면에서 조회). */
export async function createChatReport(chatSessionId: string): Promise<void> {
  try {
    await apiClient.post(`${BASE}/${chatSessionId}/report`)
  } catch {
    /* 데모: 생성 요청만 흘린다 */
  }
}

/**
 * 종합 피드백 조회. 생성이 끝나지 않았으면 `reportStatus` 가 PENDING/GENERATING 으로 온다 —
 * 화면은 그동안 준비 중 상태를 그리고 주기적으로 다시 묻는다.
 */
export async function getChatReport(chatSessionId: string): Promise<ChatReport> {
  try {
    const { data } = await apiClient.get<ChatReport>(`${BASE}/${chatSessionId}/report`)
    return data
  } catch {
    return demoChatReport(chatSessionId)
  }
}

/** 선톡 알림 활성화 설정. 12시간 무응답 시 1회 한정 · 야간(00–09시)은 아침까지 보류. */
export async function setProactiveMessageEnabled(
  chatSessionId: string,
  enabled: boolean,
): Promise<void> {
  try {
    await apiClient.patch(`${BASE}/${chatSessionId}/proactive-message-setting`, { enabled })
  } catch {
    const stored = demoSessionStore.get(chatSessionId)
    if (stored) demoSessionStore.set(chatSessionId, { ...stored, proactiveMessageEnabled: enabled })
  }
}

/* ── 메시지 ────────────────────────────────────────────── */

/** 메시지 목록. cursor 가 있으면 그보다 과거 메시지를 가져온다(위로 더 보기). */
export async function getMessages(chatSessionId: string, cursor?: string): Promise<ChatMessagePage> {
  try {
    const { data } = await apiClient.get<ChatMessagePage>(`${BASE}/${chatSessionId}/messages`, {
      params: cursor ? { cursor } : undefined,
    })
    return data
  } catch {
    const empty = cursor || isFreshlyCreatedDemoId(chatSessionId)
    return { items: empty ? [] : demoMessages(), nextCursor: null }
  }
}

/** 사용자 메시지 전송. 저장된 메시지(서버 id·시각)를 돌려받는다. */
export async function sendMessage(chatSessionId: string, text: string): Promise<ChatMessage> {
  try {
    const { data } = await apiClient.post<ChatMessage>(`${BASE}/${chatSessionId}/messages`, { text })
    return data
  } catch {
    return {
      messageId: `local-${Date.now()}`,
      sender: 'USER',
      text,
      createdAt: new Date().toISOString(),
      hasFeedback: true,
    }
  }
}

export interface StreamHandlers {
  /** 토큰 조각이 도착할 때마다 호출 */
  onDelta: (chunk: string) => void
  signal?: AbortSignal
}

/**
 * AI 답변 스트리밍(SSE). 사용자 메시지를 POST 한 **뒤** 이 스트림을 연다.
 *
 * EventSource 를 쓰지 않는 이유: 헤더를 붙일 수 없어 Bearer 토큰을 실을 수 없다.
 * fetch + ReadableStream 으로 직접 파싱한다.
 *
 * ⚠️ 이벤트 계약(잠정): `data:` 줄에 JSON 이 오고 `{ delta }` 또는 `{ text }`, 종료는 `[DONE]`
 *    또는 `{ messageId, done: true }`. 명세 확정 시 parseSseChunk 만 고치면 된다.
 */
export async function streamAiReply(
  chatSessionId: string,
  { onDelta, signal }: StreamHandlers,
): Promise<{ messageId: string; text: string }> {
  const url = `${apiClient.defaults.baseURL ?? '/api'}${BASE}/${chatSessionId}/messages/stream`
  const token = tokenStore.getAccess()

  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    return demoStream(onDelta, signal)
  }

  if (!res.ok || !res.body) {
    return demoStream(onDelta, signal)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  let messageId = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value

      // SSE 이벤트는 빈 줄로 구분된다. 마지막 조각은 다음 청크와 이어붙여야 한다.
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        const payload = parseSseEvent(event)
        if (!payload) continue
        if (payload.done) {
          messageId = payload.messageId ?? messageId
          return { messageId: messageId || `ai-${Date.now()}`, text }
        }
        if (payload.messageId) messageId = payload.messageId
        if (payload.delta) {
          text += payload.delta
          onDelta(payload.delta)
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  return { messageId: messageId || `ai-${Date.now()}`, text }
}

interface SsePayload {
  delta?: string
  messageId?: string
  done?: boolean
}

/** `event:`/`data:` 줄로 이뤄진 SSE 한 덩어리를 파싱한다. data 가 없으면 null. */
function parseSseEvent(raw: string): SsePayload | null {
  const dataLines = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  if (dataLines.length === 0) return null

  const data = dataLines.join('\n')
  if (data === '[DONE]') return { done: true }

  try {
    const json = JSON.parse(data) as Record<string, unknown>
    return {
      delta: typeof json.delta === 'string' ? json.delta : typeof json.text === 'string' ? json.text : undefined,
      messageId: typeof json.messageId === 'string' ? json.messageId : undefined,
      done: json.done === true,
    }
  } catch {
    // JSON 이 아니면 평문 델타로 취급한다
    return { delta: data }
  }
}

/* ── 피드백 · 대체 문장 ────────────────────────────────── */

export async function getMessageFeedback(
  chatSessionId: string,
  messageId: string,
): Promise<MessageFeedback> {
  try {
    const { data } = await apiClient.get<MessageFeedback>(
      `${BASE}/${chatSessionId}/messages/${messageId}/feedback`,
    )
    return data
  } catch {
    return {
      messageId,
      strengths: ['상대의 말을 받아서 되묻는 흐름이 이어졌어요.'],
      improvements: ['답이 한 문장으로 끝난 구간이 2회 있었어요. 이유나 상황을 한 줄만 덧붙여 보세요.'],
      comment: '관심 있게 듣는 모습으로 보일 수 있어요.',
    }
  }
}

export async function requestSuggestions(
  chatSessionId: string,
  messageId: string,
): Promise<SuggestedSentence[]> {
  try {
    const { data } = await apiClient.post<SuggestedSentence[]>(
      `${BASE}/${chatSessionId}/messages/${messageId}/suggestions`,
    )
    return data
  } catch {
    return [
      {
        text: '네 좋아해요! 조용한 데 찾아다니는 편인데, 혹시 자주 가는 곳 있으세요?',
        reason: '내 취향을 한 줄 덧붙이고 질문으로 넘기면 대화가 이어져요.',
      },
      {
        text: '카페 좋아해요. 요즘은 책 읽기 좋은 곳을 찾고 있어요.',
        reason: '상대가 말한 소재(책)를 이어받는 방식이에요.',
      },
      {
        text: '좋아해요! 어떤 분위기 카페 좋아하세요?',
        reason: '짧게 답하고 바로 되물으면 부담이 적어요.',
      },
    ]
  }
}

/* ── 데모 폴백 ─────────────────────────────────────────── */

/**
 * 백엔드가 없을 때 방금 만든 세션을 기억해두는 탭 수명 저장소.
 * 실서버라면 POST 로 만든 세션을 이후 GET 이 그대로 돌려주지만, 폴백에는 그 연결이 없어서
 * createChatSession 이 돌려준 stage/personality 를 바로 다음 getChatSession 이 잊어버렸다
 * (항상 고정 데모값으로 되돌아감) — 이를 막기 위한 최소 저장소.
 */
const demoSessionStore = new Map<string, AiChatSession>()

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

/**
 * 데모용 선톡 발송 시각·멘트. 실제 발송은 서버가 §7.1 규칙으로 한다.
 * 지금이 야간(00–09시)이면 **아침까지 보류**됐다가 09:05 에 나간 것으로 만든다 — 규칙 그대로.
 */
function demoProactive(): { sentAt: Date; text: string } {
  const now = new Date()
  const message = proactiveMessageAt(now)
  if (message) return { sentAt: now, text: message }

  const morning = new Date(now)
  morning.setHours(PROACTIVE_QUIET_TO, 5, 0, 0)
  return { sentAt: morning, text: proactiveMessageAt(morning) ?? '잘 잤어요?' }
}

/**
 * `demo-<timestamp>` id 는 오직 createChatSession 폴백이 방금 발급한 것이라 "방금 시작한 대화"로,
 * 그 외(`demo`·`current` 등 고정 id)는 이미 진행 중인 대화로 취급한다. 별도 저장소 없이
 * id 접두만으로 구분한다 — 데모 폴백 안에서만 쓰는 값이라 이 정도면 충분하다.
 */
function isFreshlyCreatedDemoId(chatSessionId: string): boolean {
  return chatSessionId.startsWith('demo-')
}

function demoSession(chatSessionId: string, override?: CreateChatSessionInput): AiChatSession {
  const fresh = isFreshlyCreatedDemoId(chatSessionId)
  return {
    chatSessionId,
    status: 'ACTIVE',
    stage: override?.stage ?? 'BEFORE_DATE',
    persona: {
      personaId: 'demo-persona',
      name: '지우',
      emoji: '🤖',
      personality: override?.personality ?? 'MIDDLE',
    },
    practiceGoal: '약속 일시·장소를 자연스럽게 정해보기',
    proactiveMessageEnabled: true,
    proactiveMessageSentAt: fresh ? null : demoProactive().sentAt.toISOString(),
    startedAt: fresh ? new Date().toISOString() : minutesAgo(42),
    lastUserMessageAt: fresh ? null : minutesAgo(12),
    completedAt: null,
  }
}

function demoMessages(): ChatMessage[] {
  const proactive = demoProactive()
  return [
    { messageId: 'm1', sender: 'AI', text: '안녕하세요! 오늘 하루 어떠셨어요?', createdAt: minutesAgo(40) },
    {
      messageId: 'm2',
      sender: 'USER',
      text: '안녕하세요 :) 오늘은 좀 바빴는데 이제 좀 여유가 생겼어요',
      createdAt: minutesAgo(38),
      hasFeedback: true,
    },
    {
      messageId: 'm3',
      sender: 'AI',
      text: '바쁘셨군요, 고생 많으셨어요. 저는 오늘 카페에서 책 좀 읽었어요.\n혹시 카페 자주 가시는 편이에요?',
      createdAt: minutesAgo(37),
    },
    {
      messageId: 'm4',
      sender: 'USER',
      text: '네 좋아해요! 조용한 데 찾아다니는 편이에요',
      createdAt: minutesAgo(12),
      hasFeedback: true,
    },
    {
      messageId: 'm5',
      sender: 'AI',
      text: proactive.text,
      createdAt: proactive.sentAt.toISOString(),
      isProactive: true,
    },
  ]
}

/** 종합 피드백 데모. 화법 규칙(§7.4)을 지킨 문구로만 채운다 — 점수·등수 없음. */
function demoChatReport(chatSessionId: string): ChatReport {
  const session = demoSessionStore.get(chatSessionId)
  return {
    chatSessionId,
    reportStatus: 'COMPLETED',
    startedAt: minutesAgo(42),
    completedAt: new Date().toISOString(),
    userMessageCount: 14,
    totalMessageCount: 29,
    durationMin: 42,
    stage: session?.stage ?? 'BEFORE_DATE',
    personality: session?.persona.personality ?? 'MIDDLE',
    practiceGoal: session?.practiceGoal ?? '약속 일시·장소를 자연스럽게 정해보기',
    summaryText: '상대의 말을 받아 되묻는 흐름이 자리를 잡았어요. 약속을 제안하는 대목만 한 번 더 연습하면 좋겠어요.',
    strengths: [
      '상대가 꺼낸 소재를 이어받아 질문한 적이 6번 있었어요.',
      '답장 길이가 상대와 비슷하게 유지됐어요.',
      '모르는 주제에서도 대화를 끊지 않고 되물었어요.',
    ],
    improvements: [
      '한 문장으로 끝난 답이 4번 있었어요. 이유나 상황을 한 줄만 덧붙여 보세요.',
      '약속을 제안할 때 날짜를 열어두면 상대가 정하기 어려워요. 후보를 두 개만 주는 편이 편해요.',
    ],
    patterns: [
      { label: '되묻기', count: 6 },
      { label: '짧은 단답', count: 4 },
      { label: '공감 표현', count: 3 },
    ],
    highlights: [
      {
        messageId: 'm4',
        userText: '네 좋아해요! 조용한 데 찾아다니는 편이에요',
        comment: '취향을 밝힌 건 좋았는데 대화가 여기서 한 번 멈췄어요.',
        suggestion: '네 좋아해요! 조용한 데 찾아다니는 편인데, 혹시 자주 가는 곳 있으세요?',
      },
      {
        messageId: 'm6',
        userText: '언제든 괜찮아요',
        comment: '배려로 한 말이지만 상대가 다시 정해야 해서 부담이 넘어가요.',
        suggestion: '이번 주말은 어떠세요? 토요일 오후나 일요일 낮이면 저는 다 좋아요.',
      },
    ],
    nextSuggestions: [
      '다음 대화에서는 단답 뒤에 한 줄 덧붙이기를 목표로 잡아보세요.',
      '‘소개팅 후’ 단계로 한 번 더 연습해 보면 애프터 대화가 편해져요.',
    ],
    generatedAt: new Date().toISOString(),
  }
}

const DEMO_REPLIES = [
  '오 그런 곳 좋죠. 저도 조용한 자리 찾으면 오래 앉아 있게 되더라고요.\n혹시 이번 주말엔 시간 어떠세요?',
  '그렇군요! 저도 비슷한 편이에요. 요즘은 어떤 걸로 시간 보내세요?',
  '말씀 들으니 재밌네요. 그럼 다음에 만나면 어디 가보고 싶으세요?',
]
let demoReplyIndex = 0

/** 백엔드가 없을 때 타이핑처럼 흘려주는 데모 스트림. */
async function demoStream(
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ messageId: string; text: string }> {
  const full = DEMO_REPLIES[demoReplyIndex % DEMO_REPLIES.length]
  demoReplyIndex += 1

  await wait(420, signal) // 생각하는 시간
  for (let i = 0; i < full.length; i += 2) {
    if (signal?.aborted) break
    const chunk = full.slice(i, i + 2)
    onDelta(chunk)
    await wait(28, signal)
  }
  return { messageId: `demo-ai-${Date.now()}`, text: full }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}
