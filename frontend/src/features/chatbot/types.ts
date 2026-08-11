/**
 * AI 챗봇(AI_CHAT · F5 · W-10b) 도메인 타입.
 *
 * 백엔드 SSOT
 *  - `aichat/api/AiChatSessionController.java` → /api/v1/ai-chat/sessions
 *  - `aichat/api/AiChatMessageController.java` → .../{id}/messages
 *  - `aichat/api/AiChatStreamController.java`  → .../{id}/responses/stream · /cancel · /retry
 *
 * ⚠️ 스펙 문서(`/ai-chat-sessions`)와 실제 경로(`/ai-chat/sessions`)가 다르다 — 구현을 따른다.
 *
 * ⚠️ **`stage` 이름 충돌**: 화면의 "연습 단계"(소개팅 전/후)와 백엔드 `ConversationStage`
 *    (INTRO/CONVERSATION/CLOSING — 대화가 어디까지 진행됐는지)는 **완전히 다른 개념**이고
 *    값 교집합이 없다. 화면의 연습 단계는 서버 **`ChatSessionPurpose`** 로 전달된다
 *    (`BEFORE_DATE` / `AFTER_DATE`) — 이름이 겹치는 `ConversationStage` 가 아니다.
 *
 * 규칙(와이어플로우 W-10b):
 *  - 선톡은 12시간 무응답 시 **1회 한정**, 야간 00–09시는 아침까지 보류 (⚠️ 백엔드 미구현)
 *  - 챗봇 결과는 **사랑의 온도에 반영하지 않는다**(화상 트랙과 구분)
 *  - systemPrompt 는 클라이언트에 내려오지 않는다 — 페르소나는 요약만 표시
 */

/**
 * 연습 단계(화면 개념). 오프닝 프롬프트가 갈린다.
 * ⚠️ 백엔드 `ConversationStage` 와 이름만 같고 의미가 다르다 — 아래 `ServerConversationStage` 참고.
 */
export type ConversationStage = 'BEFORE_DATE' | 'AFTER_DATE'

/**
 * 백엔드 `ConversationStage` — 대화 진행 위치. 서버가 관리하며 화면은 표시하지 않는다.
 * 세션 생성 직후에는 항상 `INTRO` 다.
 */
export type ServerConversationStage = 'INTRO' | 'CONVERSATION' | 'CLOSING'

/**
 * 백엔드 `ChatSessionPurpose`. 생성 요청에 **필수**다.
 * 값이 화면의 연습 단계와 같아졌다 — `DATE_PRACTICE` 는 단계 도입 전 세션에만 남아 있다.
 */
export type ChatSessionPurpose = ConversationStage | 'DATE_PRACTICE'

/*
 * 페르소나 성향(적극적·중간·내향적)은 **제거됐다**.
 *
 * 세션 생성 요청은 `purpose` 하나만 받으므로 성향은 서버에 전달된 적이 없다 —
 * localStorage 에만 남아 화면에 되비치는 값이었다.
 * AI 응답에 아무 영향을 주지 못하는 선택지를 사용자에게 고르게 할 이유가 없어
 * 설정 항목과 표시를 함께 걷어냈다. 남은 사용자 선택지는 연습 단계뿐이다.
 */

/** 백엔드 `ChatSessionStatus`. */
export type ChatSessionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

/** 백엔드 `ChatMessageSenderType`. */
export type MessageSender = 'USER' | 'AI'

/**
 * 백엔드 `AiResponseState` — AI 응답 생성 상태.
 * FAILED/CANCELLED 면 재시도(`.../responses/{userMessageId}/retry/stream`)가 가능하다.
 */
export type AiResponseState = 'IDLE' | 'PROCESSING' | 'FAILED' | 'CANCELLED'

/**
 * 페르소나 요약(GET /ai-personas/{personaId} 또는 세션 응답에 임베드).
 *
 * ⚠️ 명세 §7.2(v4·A18)로 항목이 **연습 단계 · 성향 2종**으로 축소됐다.
 *    말투(speechStyle)·대화 난이도(difficulty)·반응 정도(reactionLevel)는 제거됐으므로
 *    이 타입에도, 화면에도 넣지 않는다. name/emoji 는 대화 상대를 부르기 위한 표시용이다.
 */
export interface AiPersonaSummary {
  /** 백엔드 `aiPersonaKey`. 첫 AI 응답 전에는 null 이라 빈 문자열로 채운다 */
  personaId: string
  name: string
  /** 아바타 대체 이모지 */
  emoji?: string | null
}

/**
 * AI 채팅 세션 뷰모델.
 * 백엔드 `AiChatSessionSummaryResponse` + 로컬 보관 설정(연습 단계·성향)을 합친 값이다.
 */
export interface AiChatSession {
  /** 백엔드 `sessionId` (Long) */
  chatSessionId: number
  status: ChatSessionStatus
  /** 화면의 연습 단계. **로컬 보관값**(서버가 받지 않는다) */
  stage: ConversationStage
  persona: AiPersonaSummary
  /** 이 연습의 목표(온보딩 설문 `practiceGoals[0]`) */
  practiceGoal?: string | null
  /** AI 응답 상태 — 재시도/취소 버튼의 근거 */
  aiResponseState: AiResponseState
  /** 재시도 대상 USER 메시지 id. `aiResponseState` 가 FAILED/CANCELLED 일 때 채워진다 */
  pendingUserMessageId?: number | null
  /** 마지막 실패 코드(있으면 안내에 쓴다) */
  lastAiResponseErrorCode?: string | null
  /**
   * 선톡 알림 활성화 여부.
   * ⚠️ 백엔드 미구현 — 로컬 보관값이며 서버 동작에 영향을 주지 않는다.
   */
  proactiveMessageEnabled: boolean
  /** 선톡 발송 시각. ⚠️ 백엔드 미구현 → 항상 null */
  proactiveMessageSentAt?: string | null
  /** 백엔드 `createdAt` (ISO 로 정규화) */
  startedAt: string
  /** ⚠️ 백엔드 미제공 → 항상 null */
  lastUserMessageAt?: string | null
  /** 백엔드 `closedAt` (ISO 로 정규화) */
  completedAt?: string | null
}

/** 대화 메시지 뷰모델 (백엔드 `AiChatMessageResponse` 매핑). */
export interface ChatMessage {
  /** 백엔드 `messageId` (Long) — 낙관적 렌더 중에는 임시 문자열이 들어간다 */
  messageId: string
  sender: MessageSender
  text: string
  createdAt: string
  /** 선톡 여부 — 대화 흐름에서 구분 표시한다 */
  isProactive?: boolean
  /** 이 메시지에 개별 피드백이 있는지(USER 메시지 한정) */
  hasFeedback?: boolean
}

/**
 * 메시지 목록 페이지.
 * ⚠️ 백엔드는 커서 페이징이 없고 전량(`List<AiChatMessageResponse>`)을 준다 →
 *    `nextCursor` 는 항상 null 이다. 서버가 페이징을 붙이면 매핑만 채우면 된다.
 */
export interface ChatMessagePage {
  items: ChatMessage[]
  /** 더 과거 메시지를 가리키는 커서. 현재는 항상 null */
  nextCursor?: string | null
}

/**
 * 메시지별 피드백.
 * ⚠️ **백엔드 미구현** — 화면 유지를 위한 로컬 샘플로만 채워진다.
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
 * 대화 전체에 대한 종합 피드백.
 *
 * ⚠️ **백엔드 미구현** — 생성/조회 엔드포인트가 없다. 지금은 로컬 샘플로 화면만 유지한다.
 * 🔒 규칙: 챗봇 결과는 **사랑의 온도에 반영하지 않는다** — 온도·등수 필드를 두지 않는다.
 */
export interface ChatReport {
  chatSessionId: number
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

/**
 * 페르소나 설정 화면의 초기값.
 * ⚠️ `GET /ai-personas/options` 는 백엔드에 없다 → `GET /users/me/profile` 의 `regionCity` 로 대체한다.
 */
export interface AiPersonaOptions {
  /** 이미 저장된 시·도. 있으면 지역 입력 카드를 건너뛴다(최초 1회 수집 규칙). */
  regionCity: string | null
}

/** POST /ai-personas/recommendations 응답. 초기 선택값을 채우는 용도(조건 기반 추천). */
export interface PersonaRecommendation {
  stage: ConversationStage
}

/** POST /ai-chat-sessions 요청 본문. 페르소나는 서버가 조합하므로 personaId 를 직접 넘기지 않는다. */
export interface CreateChatSessionInput {
  stage: ConversationStage
}

export const STAGE_LABEL: Record<ConversationStage, string> = {
  BEFORE_DATE: '소개팅 전',
  AFTER_DATE: '소개팅 후',
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
