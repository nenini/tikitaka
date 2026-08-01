/**
 * AI 챗봇(AI_CHAT · F5 · W-10b) 도메인 타입.
 *
 * ⚠️ 백엔드 API 명세는 **URL·메서드만 확정**된 상태다(2026-07-28 기준). 아래 DTO 필드명은
 *    ERD(chatbot_conversations · chatbot_messages)와 와이어플로우 화면 요소에서 역산한 잠정안이다.
 *    실제 응답 스키마가 나오면 이 파일과 api.ts 의 매핑만 고치면 화면은 그대로 돌아간다.
 *
 * 규칙(와이어플로우 W-10b):
 *  - 선톡은 12시간 무응답 시 **1회 한정**, 야간 00–09시는 아침까지 보류
 *  - 챗봇 결과는 **사랑의 온도에 반영하지 않는다**(화상 트랙과 구분)
 *  - systemPrompt 는 클라이언트에 내려오지 않는다 — 페르소나는 요약만 표시
 */

/** 연습 단계. 오프닝 프롬프트가 갈린다. */
export type ConversationStage = 'BEFORE_DATE' | 'AFTER_DATE'

/** 페르소나 성향(말투·난이도·반응 정도 항목은 제거됨 — W-10 규칙). */
export type PersonaPersonality = 'ACTIVE' | 'MIDDLE' | 'INTROVERTED'

export type ChatSessionStatus = 'ACTIVE' | 'COMPLETED'

export type MessageSender = 'USER' | 'AI'

/**
 * 페르소나 요약(GET /ai-personas/{personaId} 또는 세션 응답에 임베드).
 *
 * ⚠️ 명세 §7.2(v4·A18)로 항목이 **연습 단계 · 성향 2종**으로 축소됐다.
 *    말투(speechStyle)·대화 난이도(difficulty)·반응 정도(reactionLevel)는 제거됐으므로
 *    이 타입에도, 화면에도 넣지 않는다. name/emoji 는 대화 상대를 부르기 위한 표시용이다.
 */
export interface AiPersonaSummary {
  personaId: string
  name: string
  /** 아바타 대체 이모지 */
  emoji?: string | null
  personality: PersonaPersonality
}

/** AI 채팅 세션(GET /ai-chat-sessions/{id}, GET /ai-chat-sessions/current). */
export interface AiChatSession {
  chatSessionId: string
  status: ChatSessionStatus
  stage: ConversationStage
  persona: AiPersonaSummary
  /** 이 연습의 목표(온보딩 '고치고 싶은 점' 기반) */
  practiceGoal?: string | null
  /** 선톡 알림 활성화 여부(PATCH .../proactive-message-setting) */
  proactiveMessageEnabled: boolean
  /** 선톡 발송 시각. 값이 있으면 **재발송 금지** */
  proactiveMessageSentAt?: string | null
  startedAt: string
  lastUserMessageAt?: string | null
  completedAt?: string | null
}

/** 대화 메시지(GET /ai-chat-sessions/{id}/messages). */
export interface ChatMessage {
  messageId: string
  sender: MessageSender
  text: string
  createdAt: string
  /** 선톡 여부 — 대화 흐름에서 구분 표시한다 */
  isProactive?: boolean
  /** 이 메시지에 개별 피드백이 있는지(USER 메시지 한정) */
  hasFeedback?: boolean
}

/** 메시지 목록 페이지(커서 기반). 위로 스크롤하면 이전 메시지를 더 불러온다. */
export interface ChatMessagePage {
  items: ChatMessage[]
  /** 더 과거 메시지를 가리키는 커서. null 이면 맨 처음 */
  nextCursor?: string | null
}

/**
 * 메시지별 피드백(GET .../messages/{messageId}/feedback).
 * 화법 규칙(§7.4): 점수·등수 없음, 사실+횟수, 추정은 추정으로, 다음 행동 제안.
 */
export interface MessageFeedback {
  messageId: string
  /** 좋았던 점 */
  strengths: string[]
  /** 다음에 해볼 것 ("실패"가 아니라 성장 포인트) */
  improvements: string[]
  /** 한 줄 코멘트 */
  comment?: string | null
}

/** 대체 문장 추천(POST .../messages/{messageId}/suggestions). */
export interface SuggestedSentence {
  text: string
  /** 왜 이렇게 말하면 좋은지 */
  reason?: string | null
}

/* ── 종합 피드백(W-10b 종료 후) ─────────────────────────── */

/**
 * 종합 피드백 생성 상태.
 * `POST .../report` 로 생성을 걸고 `GET .../report` 로 결과를 가져온다 — 생성에 시간이 걸려
 * 화면은 준비 중 상태를 먼저 그린다.
 */
export type ChatReportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED'

/**
 * 대화에서 반복된 패턴 하나. 세션 리포트(W-16)의 강점/보완 키워드와 같은 성격이지만
 * 여기서는 **텍스트 대화**에서만 나온다.
 */
export interface ChatPattern {
  label: string
  /** 대화에서 몇 번 나타났는지 — 근거 없는 단정 대신 횟수를 남긴다(§7.4) */
  count: number
}

/**
 * 되짚어볼 순간 하나. "이 메시지에서 이렇게 해볼 수 있었어요" 형식으로,
 * 메시지별 피드백(FeedbackModal)과 같은 규칙을 따른다 — 점수 없음, 대안 제시.
 */
export interface ChatHighlight {
  messageId: string
  /** 내가 보낸 원문 */
  userText: string
  /** 왜 짚었는지 (한 줄) */
  comment: string
  /** 이렇게 말해볼 수도 있어요 */
  suggestion?: string | null
}

/**
 * GET /ai-chat-sessions/{id}/report — 대화 전체에 대한 종합 피드백.
 *
 * ⚠️ 필드명은 응답 스키마 미확정 상태의 잠정안이다(api.ts 와 같은 방침).
 * 🔒 규칙: 챗봇 결과는 **사랑의 온도에 반영하지 않는다** — 온도·등수 필드를 두지 않는다.
 */
export interface ChatReport {
  chatSessionId: string
  reportStatus: ChatReportStatus
  /** 대화 시작~종료 */
  startedAt: string
  completedAt?: string | null
  /** 내가 보낸 메시지 수 */
  userMessageCount: number
  /** 주고받은 전체 메시지 수 */
  totalMessageCount: number
  /** 대화가 이어진 시간(분) */
  durationMin: number
  stage: ConversationStage
  personality: PersonaPersonality
  practiceGoal?: string | null
  /** 한 줄 총평 */
  summaryText?: string | null
  /** 잘한 점 */
  strengths: string[]
  /** 다음에 해볼 것 */
  improvements: string[]
  patterns: ChatPattern[]
  highlights: ChatHighlight[]
  /** 다음 연습 제안 */
  nextSuggestions: string[]
  generatedAt?: string | null
}

/**
 * 챗봇 최초 이용 시 수집하는 지역 목록(§7.1). **시·도만** 받는다 —
 * 구·군은 미수집(와이어플로우 W-10 사용자 지시). 상대에게는 공개하지 않는다.
 */
export const REGION_CITIES = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
] as const

export type RegionCity = (typeof REGION_CITIES)[number]

/** GET /ai-personas/options 응답. */
export interface AiPersonaOptions {
  /** 이미 저장된 시·도. 있으면 지역 입력 카드를 건너뛴다(최초 1회 수집 규칙). */
  regionCity: string | null
}

/** POST /ai-personas/recommendations 응답. 초기 선택값을 채우는 용도(조건 기반 추천). */
export interface PersonaRecommendation {
  stage: ConversationStage
  personality: PersonaPersonality
}

/** POST /ai-chat-sessions 요청 본문. 페르소나는 서버가 조합하므로 personaId 를 직접 넘기지 않는다. */
export interface CreateChatSessionInput {
  stage: ConversationStage
  personality: PersonaPersonality
}

export const STAGE_LABEL: Record<ConversationStage, string> = {
  BEFORE_DATE: '소개팅 전',
  AFTER_DATE: '소개팅 후',
}

export const PERSONALITY_LABEL: Record<PersonaPersonality, string> = {
  ACTIVE: '적극적',
  MIDDLE: '중간',
  INTROVERTED: '내향적',
}

/** 성향이 대화에서 어떻게 나타나는지(W-10 설정 화면과 같은 문구). */
export const PERSONALITY_DESC: Record<PersonaPersonality, string> = {
  ACTIVE: '먼저 말 걸고 리드하는 편',
  MIDDLE: '상황에 맞춰가는 편',
  INTROVERTED: '듣고 반응하는 편',
}

export const STAGE_DESC: Record<ConversationStage, string> = {
  BEFORE_DATE: '첫 인사 · 호감 표현 · 약속 정하기',
  AFTER_DATE: '애프터 대화 · 재만남 제안',
}

/**
 * 시간대별 선톡 멘트(명세 §7.1). **발송은 서버가 한다** — 클라이언트는 이 표를
 * 사용자 안내와 데모 데이터에 쓴다. 두 곳이 어긋나지 않게 상수 하나로 둔다.
 *
 * 00:00–09:00 은 발송하지 않고 아침까지 보류한다(D-05 확정).
 */
export interface ProactiveWindow {
  /** 시작 시(포함) */
  fromHour: number
  /** 끝 시(제외) */
  toHour: number
  label: string
  message: string
}

export const PROACTIVE_WINDOWS: ProactiveWindow[] = [
  { fromHour: 9, toHour: 12, label: '아침', message: '잘 잤어요?' },
  { fromHour: 12, toHour: 18, label: '점심', message: '점심 뭐 먹었어요?' },
  { fromHour: 18, toHour: 24, label: '저녁', message: '저녁 뭐 먹었어요?' },
]

/** 야간(발송 보류) 시작·종료 시각. */
export const PROACTIVE_QUIET_FROM = 0
export const PROACTIVE_QUIET_TO = 9

/** 해당 시각에 발송될 선톡 멘트. 야간이면 null(= 아침까지 보류). */
export function proactiveMessageAt(date: Date): string | null {
  const hour = date.getHours()
  return PROACTIVE_WINDOWS.find((w) => hour >= w.fromHour && hour < w.toHour)?.message ?? null
}
