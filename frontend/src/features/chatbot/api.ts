import { apiClient } from '@/shared/api/client'
import { tokenStore } from '@/shared/api/tokens'
import { errorCodeOf, unwrap } from '@/shared/api/envelope'
import type { ApiEnvelope } from '@/shared/api/envelope'
import { serverDateTimeToIso, serverDateTimeToIsoRequired } from '@/shared/api/datetime'
import { getMyPracticeGoal, getMyProfile, updateRegionCity } from '@/shared/api/me'
import { PROACTIVE_QUIET_TO, proactiveMessageAt } from './types'
import type {
  AiChatSession,
  AiPersonaOptions,
  AiResponseState,
  ChatMessage,
  ChatMessagePage,
  ChatReport,
  ChatSessionStatus,
  ConversationStage,
  CreateChatSessionInput,
  MessageFeedback,
  MessageSender,
  PersonaRecommendation,
  ServerConversationStage,
  SuggestedSentence,
} from './types'

/**
 * AI 챗봇(AI_CHAT) REST + SSE.
 *
 * 백엔드 SSOT — 스펙 문서(`/ai-chat-sessions`)와 경로가 다르므로 **구현 코드** 기준.
 *
 *   GET   /api/v1/ai-chat/sessions                          내 세션 목록(최신순)
 *   GET   /api/v1/ai-chat/sessions/{id}                     세션 상세 `{ session, messages }`
 *   POST  /api/v1/ai-chat/sessions                          세션 생성 `{ purpose }`
 *   PATCH /api/v1/ai-chat/sessions/{id}/close               세션 종료
 *   GET   /api/v1/ai-chat/sessions/{id}/messages            메시지 전량(페이징 없음)
 *   POST  /api/v1/ai-chat/sessions/{id}/responses/stream    **전송 + AI 응답 스트리밍(SSE)**
 *   POST  /api/v1/ai-chat/sessions/{id}/responses/{userMessageId}/retry/stream
 *   PATCH /api/v1/ai-chat/sessions/{id}/responses/cancel    진행 중 응답 취소
 *
 * ⚠️ 전송 흐름이 예전 가정과 다르다. "메시지 POST → 별도 GET SSE" 2단계가 아니라
 *    **POST 하나가 사용자 메시지 저장 + AI 스트리밍을 동시에** 처리한다.
 *    사용자 메시지 전용 엔드포인트는 존재하지 않는다.
 *
 * ⚠️ 백엔드에 없는 것(화면은 로컬 샘플/보관값으로 유지):
 *    페르소나 옵션·추천 · 메시지별 피드백 · 대체 문장 추천 · 선톡 설정 · 종합 피드백.
 */

const BASE = '/v1/ai-chat/sessions'

/* ── 로컬 보관 설정 ────────────────────────────────────── */

/**
 * 연습 단계는 서버가 받지 않는다(`AiChatSessionCreateRequest` 는 `purpose` 만).
 * 화면은 이 값으로 헤더를 그리므로 세션별로 브라우저에 보관한다.
 *
 * ⚠️ 기기가 바뀌면 초기값으로 되돌아간다. 서버가 필드를 받아주면 이 저장소는 지운다.
 */
interface SessionPreference {
  stage: ConversationStage
  personaName?: string
  proactiveMessageEnabled?: boolean
}

const PREF_KEY = (sessionId: number) => `bd_chat_pref_${sessionId}`
const DEFAULT_PREFERENCE: SessionPreference = { stage: 'BEFORE_DATE' }

function readPreference(sessionId: number): SessionPreference {
  try {
    const raw = localStorage.getItem(PREF_KEY(sessionId))
    return raw
      ? { ...DEFAULT_PREFERENCE, ...(JSON.parse(raw) as SessionPreference) }
      : DEFAULT_PREFERENCE
  } catch {
    return DEFAULT_PREFERENCE
  }
}

function writePreference(sessionId: number, patch: Partial<SessionPreference>) {
  try {
    const next = { ...readPreference(sessionId), ...patch }
    localStorage.setItem(PREF_KEY(sessionId), JSON.stringify(next))
  } catch {
    /* 저장 실패는 무시 — 기본값으로 동작한다 */
  }
}

/** SSE `persona` 이벤트로 받은 상대 표시명을 보관한다(다음 조회에서도 같은 이름을 쓰기 위해). */
export function rememberPersonaName(sessionId: number, personaName: string) {
  writePreference(sessionId, { personaName })
}

/* ── 원본 응답 ─────────────────────────────────────────── */

/** `AiChatSessionSummaryResponse`. */
interface RawSessionSummary {
  sessionId: number
  aiPersonaKey: string | null
  purpose: string
  status: ChatSessionStatus
  aiResponseState: AiResponseState
  pendingUserMessageId: number | null
  lastAiResponseErrorCode: string | null
  lastMessage: string | null
  messageCount: number
  createdAt: string
  closedAt: string | null
}

/** `AiChatSessionCreateResponse`. */
interface RawSessionCreated {
  sessionId: number
  aiPersonaKey: string | null
  purpose: string
  stage: ServerConversationStage
  status: ChatSessionStatus
  createdAt: string
}

/** `AiChatMessageResponse`. */
interface RawMessage {
  messageId: number
  senderType: MessageSender
  messageText: string
  sequenceNo: number
  proactive: boolean
  createdAt: string
}

/** `AiChatSessionDetailResponse`. */
interface RawSessionDetail {
  session: RawSessionSummary
  messages: RawMessage[]
}

/** `AiChatSessionCloseResponse`. */
interface RawSessionClosed {
  sessionId: number
  status: ChatSessionStatus
  closedAt: string | null
}

/* ── 매핑 ──────────────────────────────────────────────── */

function toSession(raw: RawSessionSummary, practiceGoal: string | null): AiChatSession {
  const pref = readPreference(raw.sessionId)
  return {
    chatSessionId: raw.sessionId,
    status: raw.status,
    stage: pref.stage,
    persona: {
      // 첫 AI 응답 전에는 서버가 페르소나를 고르지 않아 key 가 null 이다.
      personaId: raw.aiPersonaKey ?? '',
      name: pref.personaName ?? '상대',
      emoji: '🙂',
    },
    practiceGoal,
    aiResponseState: raw.aiResponseState,
    pendingUserMessageId: raw.pendingUserMessageId,
    lastAiResponseErrorCode: raw.lastAiResponseErrorCode,
    proactiveMessageEnabled: pref.proactiveMessageEnabled ?? true,
    proactiveMessageSentAt: null,
    startedAt: serverDateTimeToIsoRequired(raw.createdAt),
    lastUserMessageAt: null,
    completedAt: serverDateTimeToIso(raw.closedAt),
  }
}

function toMessage(raw: RawMessage): ChatMessage {
  return {
    messageId: String(raw.messageId),
    sender: raw.senderType,
    text: raw.messageText,
    createdAt: serverDateTimeToIsoRequired(raw.createdAt),
    isProactive: raw.proactive,
    // 메시지별 피드백 API 가 없다 → 피드백 버튼을 붙일 근거가 없다.
    hasFeedback: false,
  }
}

/* ── 페르소나 설정(W-10) ──────────────────────────────── */

/**
 * 지역 카드를 건너뛸지 판단.
 * ⚠️ `GET /ai-personas/options` 는 없다 → 프로필의 `regionCity` 로 대체한다.
 */
export async function getPersonaOptions(): Promise<AiPersonaOptions> {
  try {
    const profile = await getMyProfile()
    return { regionCity: profile.regionCity }
  } catch {
    // 프로필을 못 읽으면 최초 이용으로 취급해 입력을 받는다.
    return { regionCity: null }
  }
}

/**
 * 조건 기반 추천.
 * ⚠️ **백엔드 미구현**(`POST /ai-personas/recommendations` 없음) → 고정 초기값.
 */
export async function requestPersonaRecommendation(): Promise<PersonaRecommendation> {
  return { stage: 'BEFORE_DATE' }
}

/** 챗봇 최초 이용 시 시·도 저장 — `PATCH /api/v1/users/me/profile`. */
export async function saveRegionCity(regionCity: string): Promise<void> {
  await updateRegionCity(regionCity)
}

/* ── 세션 ──────────────────────────────────────────────── */

/**
 * 세션 생성('대화 시작').
 * 서버는 `purpose` 만 받는다(값도 'DATE_PRACTICE' 고정) — 연습 단계는 로컬에 보관한다.
 * 이미 ACTIVE 세션이 있으면 409(`ACTIVE_CHAT_SESSION_EXISTS`) → 그 세션을 돌려준다.
 */
export async function createChatSession(input: CreateChatSessionInput): Promise<AiChatSession> {
  try {
    const created = unwrap(
      await apiClient.post<ApiEnvelope<RawSessionCreated>>(BASE, { purpose: 'DATE_PRACTICE' }),
    )
    writePreference(created.sessionId, { stage: input.stage })
    const practiceGoal = await getMyPracticeGoal().catch(() => null)
    return toSession(
      {
        sessionId: created.sessionId,
        aiPersonaKey: created.aiPersonaKey,
        purpose: created.purpose,
        status: created.status,
        aiResponseState: 'IDLE',
        pendingUserMessageId: null,
        lastAiResponseErrorCode: null,
        lastMessage: null,
        messageCount: 0,
        createdAt: created.createdAt,
        closedAt: null,
      },
      practiceGoal,
    )
  } catch (error) {
    if (errorCodeOf(error) === 'ACTIVE_CHAT_SESSION_EXISTS') {
      const current = await getCurrentChatSession()
      if (current) {
        // 진행 중 세션의 설정을 사용자가 방금 고른 값으로 갱신한다.
        writePreference(current.chatSessionId, {
          stage: input.stage,
        })
        return {
          ...current,
          stage: input.stage,
        }
      }
    }
    throw error
  }
}

/**
 * 진행 중인 세션. 없으면 null.
 * ⚠️ `GET .../current` 는 백엔드에 없다 → 목록에서 ACTIVE 를 고른다(목록은 최신순).
 */
export async function getCurrentChatSession(): Promise<AiChatSession | null> {
  const [list, practiceGoal] = await Promise.all([
    apiClient.get<ApiEnvelope<RawSessionSummary[]>>(BASE).then(unwrap),
    getMyPracticeGoal().catch(() => null),
  ])
  const active = list.find((s) => s.status === 'ACTIVE')
  return active ? toSession(active, practiceGoal) : null
}

/** 내 세션 목록(히스토리). 전용 화면은 아직 없지만 계약은 열어둔다. */
export async function getChatSessions(): Promise<AiChatSession[]> {
  const list = unwrap(await apiClient.get<ApiEnvelope<RawSessionSummary[]>>(BASE))
  return list.map((raw) => toSession(raw, null))
}

/**
 * 세션 상세. 백엔드가 **세션과 메시지를 함께** 준다 —
 * 예전처럼 세션/메시지를 따로 두 번 부르지 않는다.
 */
export async function getChatSessionDetail(
  chatSessionId: number,
): Promise<{ session: AiChatSession; messages: ChatMessage[] }> {
  const [detail, practiceGoal] = await Promise.all([
    apiClient.get<ApiEnvelope<RawSessionDetail>>(`${BASE}/${chatSessionId}`).then(unwrap),
    getMyPracticeGoal().catch(() => null),
  ])
  return {
    session: toSession(detail.session, practiceGoal),
    messages: (detail.messages ?? []).map(toMessage),
  }
}

/** 종료. 응답 생성 중이면 서버가 409(`AI_RESPONSE_ALREADY_IN_PROGRESS`) 로 막는다. */
export async function completeChatSession(chatSessionId: number): Promise<AiChatSession> {
  const closed = unwrap(
    await apiClient.patch<ApiEnvelope<RawSessionClosed>>(`${BASE}/${chatSessionId}/close`),
  )
  try {
    const { session } = await getChatSessionDetail(chatSessionId)
    return session
  } catch {
    // 상세 조회가 실패해도 종료 사실은 확정이다.
    return toSession(
      {
        sessionId: closed.sessionId,
        aiPersonaKey: null,
        purpose: 'DATE_PRACTICE',
        status: closed.status,
        aiResponseState: 'IDLE',
        pendingUserMessageId: null,
        lastAiResponseErrorCode: null,
        lastMessage: null,
        messageCount: 0,
        createdAt: new Date().toISOString(),
        closedAt: closed.closedAt,
      },
      null,
    )
  }
}

/** 진행 중인 AI 응답 취소. */
export async function cancelAiResponse(chatSessionId: number): Promise<void> {
  await apiClient.patch(`${BASE}/${chatSessionId}/responses/cancel`)
}

/* ── 메시지 ────────────────────────────────────────────── */

/**
 * 메시지 목록.
 * ⚠️ 백엔드는 커서 페이징이 없다 — 전량을 준다. `nextCursor` 는 항상 null.
 */
export async function getMessages(chatSessionId: number): Promise<ChatMessagePage> {
  const list = unwrap(
    await apiClient.get<ApiEnvelope<RawMessage[]>>(`${BASE}/${chatSessionId}/messages`),
  )
  return { items: (list ?? []).map(toMessage), nextCursor: null }
}

/* ── 전송 + 스트리밍 (SSE) ────────────────────────────── */

export interface StreamHandlers {
  /** 토큰 조각이 도착할 때마다 호출 */
  onDelta: (chunk: string) => void
  /** 사용자 메시지가 저장돼 서버 id 가 정해졌을 때(낙관적 렌더 교체용) */
  onUserMessageId?: (userMessageId: number) => void
  /** 서버가 페르소나를 처음 고른 순간 */
  onPersona?: (persona: { personaKey: string; displayName: string }) => void
  signal?: AbortSignal
}

export interface StreamResult {
  userMessageId: number | null
  aiMessageId: number | null
  text: string
}

/**
 * 사용자 메시지 전송 + AI 응답 스트리밍. **POST 하나로 둘 다 처리한다.**
 *
 * EventSource 를 쓰지 않는 이유: POST 를 보낼 수 없고 헤더(Bearer)도 붙일 수 없다.
 * fetch + ReadableStream 으로 직접 파싱한다.
 *
 * 서버 이벤트 순서 (SSOT: `AiChatStreamSwaggerDocs`)
 *   connected {sessionId, userMessageId}
 *   persona   {personaKey, displayName}      ← 첫 선택 시에만
 *   chunk     {sequence, content}            ← 1..N
 *   done      {sessionId, aiMessageId, messageSequence, personaKey}
 *   error     {code, message}                ← 실패 시
 */
export async function sendMessageAndStream(
  chatSessionId: number,
  text: string,
  handlers: StreamHandlers,
): Promise<StreamResult> {
  return runStream(
    `${BASE}/${chatSessionId}/responses/stream`,
    { method: 'POST', body: JSON.stringify({ messageText: text }) },
    handlers,
  )
}

/**
 * 실패·취소된 AI 응답 재시도. 기존 USER 메시지를 다시 저장하지 않는다.
 * `session.pendingUserMessageId` 를 그대로 넘긴다.
 */
export async function retryAiReply(
  chatSessionId: number,
  userMessageId: number,
  handlers: StreamHandlers,
): Promise<StreamResult> {
  return runStream(
    `${BASE}/${chatSessionId}/responses/${userMessageId}/retry/stream`,
    { method: 'POST' },
    handlers,
  )
}

async function runStream(
  path: string,
  init: { method: string; body?: string },
  { onDelta, onUserMessageId, onPersona, signal }: StreamHandlers,
): Promise<StreamResult> {
  const url = `${apiClient.defaults.baseURL ?? '/api'}${path}`
  const token = tokenStore.getAccess()

  const res = await fetch(url, {
    method: init.method,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body,
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error('AI 응답을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  let userMessageId: number | null = null
  let aiMessageId: number | null = null
  let streamError: string | null = null

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value

      // SSE 이벤트는 빈 줄로 구분된다. 마지막 조각은 다음 청크와 이어붙여야 한다.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        const parsed = parseSseFrame(frame)
        if (!parsed) continue
        const { event, data } = parsed

        switch (event) {
          case 'connected': {
            const id = numberOf(data.userMessageId)
            if (id != null) {
              userMessageId = id
              onUserMessageId?.(id)
            }
            break
          }
          case 'persona': {
            if (typeof data.personaKey === 'string' && typeof data.displayName === 'string') {
              onPersona?.({ personaKey: data.personaKey, displayName: data.displayName })
            }
            break
          }
          case 'chunk': {
            // 서버 필드명은 `content` 다(`delta`/`text` 아님).
            if (typeof data.content === 'string' && data.content) {
              text += data.content
              onDelta(data.content)
            }
            break
          }
          case 'done': {
            aiMessageId = numberOf(data.aiMessageId)
            return { userMessageId, aiMessageId, text }
          }
          case 'error': {
            streamError =
              typeof data.message === 'string' ? data.message : 'AI 응답 중 오류가 발생했어요.'
            break
          }
          default:
            break
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => {})
  }

  if (streamError) throw new Error(streamError)
  return { userMessageId, aiMessageId, text }
}

/**
 * `event:` / `data:` 줄로 이뤄진 SSE 한 덩어리를 파싱한다.
 * 예전 구현은 `event:` 줄을 무시해서 종료(`done`)를 영원히 감지하지 못했다.
 */
function parseSseFrame(raw: string): { event: string; data: Record<string, unknown> } | null {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null

  const payload = dataLines.join('\n')
  try {
    const parsed = JSON.parse(payload) as unknown
    return {
      event,
      data: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {},
    }
  } catch {
    // JSON 이 아니면 평문으로 취급한다(chunk 만 의미가 있다).
    return { event, data: { content: payload } }
  }
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/* ── 선톡 (백엔드 미구현) ─────────────────────────────── */

/**
 * 선톡 알림 설정.
 * ⚠️ **백엔드 미구현**(`PATCH .../proactive-message-setting` 없음).
 *    지금은 로컬에만 저장되고 실제 발송에 영향을 주지 않는다.
 */
export async function setProactiveMessageEnabled(
  chatSessionId: number,
  enabled: boolean,
): Promise<void> {
  writePreference(chatSessionId, { proactiveMessageEnabled: enabled })
}

/**
 * 지금 시각에 나갈 선톡 멘트. 화면 안내에만 쓴다(발송은 서버 몫이며 아직 미구현).
 * 야간이면 아침 첫 창의 멘트를 돌려준다.
 */
export function previewProactiveMessage(now = new Date()): string {
  const message = proactiveMessageAt(now)
  if (message) return message
  const morning = new Date(now)
  morning.setHours(PROACTIVE_QUIET_TO, 5, 0, 0)
  return proactiveMessageAt(morning) ?? '잘 잤어요?'
}

/* ── 피드백 · 대체 문장 (백엔드 미구현) ───────────────── */

/**
 * 메시지별 피드백.
 * ⚠️ **백엔드 미구현** — 화면 확인용 샘플을 돌려준다.
 */
export async function getMessageFeedback(
  _chatSessionId: number,
  messageId: string,
): Promise<MessageFeedback> {
  return {
    messageId,
    strengths: ['상대의 말을 받아서 되묻는 흐름이 이어졌어요.'],
    improvements: [
      '답이 한 문장으로 끝난 구간이 2회 있었어요. 이유나 상황을 한 줄만 덧붙여 보세요.',
    ],
    comment: '관심 있게 듣는 모습으로 보일 수 있어요.',
  }
}

/**
 * 대체 문장 추천.
 * ⚠️ **백엔드 미구현** — 화면 확인용 샘플을 돌려준다.
 */
export async function requestSuggestions(
  _chatSessionId: number,
  _messageId: string,
): Promise<SuggestedSentence[]> {
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

/* ── 종합 피드백 (백엔드 미구현) ──────────────────────── */

/** ⚠️ **백엔드 미구현** — 생성 요청을 보낼 곳이 없다. */
export async function createChatReport(_chatSessionId: number): Promise<void> {
  /* no-op */
}

/**
 * 종합 피드백 조회.
 * ⚠️ **백엔드 미구현** — 대화 통계(횟수·시간)는 서버 메시지에서 실제로 계산하고,
 *    분석 문구만 샘플이다. 어디까지가 실제 값인지 화면에서도 알 수 있게 총평에 밝힌다.
 */
export async function getChatReport(chatSessionId: number): Promise<ChatReport> {
  const pref = readPreference(chatSessionId)
  const [messages, practiceGoal] = await Promise.all([
    getMessages(chatSessionId)
      .then((page) => page.items)
      .catch(() => [] as ChatMessage[]),
    getMyPracticeGoal().catch(() => null),
  ])

  const userMessages = messages.filter((m) => m.sender === 'USER')
  const first = messages[0]?.createdAt
  const last = messages.at(-1)?.createdAt
  const durationMin =
    first && last
      ? Math.max(1, Math.round((new Date(last).getTime() - new Date(first).getTime()) / 60_000))
      : 0

  return {
    chatSessionId,
    reportStatus: 'COMPLETED',
    startedAt: first ?? new Date().toISOString(),
    completedAt: last ?? null,
    // 여기까지는 서버 메시지에서 계산한 **실제 값**이다.
    userMessageCount: userMessages.length,
    totalMessageCount: messages.length,
    durationMin,
    stage: pref.stage,
    practiceGoal,
    // 아래부터는 백엔드 분석 결과가 없어 샘플 문구다.
    summaryText: '대화 분석은 아직 서버에 연결되지 않았어요. 아래 내용은 화면 확인용 예시입니다.',
    strengths: [
      '상대가 꺼낸 소재를 이어받아 질문한 적이 있어요.',
      '답장 길이가 상대와 비슷하게 유지됐어요.',
    ],
    improvements: [
      '한 문장으로 끝난 답에 이유나 상황을 한 줄만 덧붙여 보세요.',
      '약속을 제안할 때 후보를 두 개만 주면 상대가 정하기 편해요.',
    ],
    patterns: [],
    highlights: [],
    nextSuggestions: ['다음 대화에서는 단답 뒤에 한 줄 덧붙이기를 목표로 잡아보세요.'],
    generatedAt: new Date().toISOString(),
  }
}
