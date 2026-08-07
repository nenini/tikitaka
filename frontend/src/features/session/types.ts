/**
 * 화상 세션(W-12 · SESSION/COACH/SILENCE/SAFETY/MISSION) 타입.
 *
 * 백엔드 SSOT
 *  - `room/api/SessionController.java`         → /api/v1/sessions
 *  - `room/api/SessionRealtimeController.java` → STOMP `/app/sessions/{id}/*`
 *  - `mission/api/MissionController.java`      → /api/v1/sessions/{id}/missions
 *  - `silence/api/QuestionCardController.java` → /api/v1/sessions/{id}/question-cards
 *  - 실시간 페이로드: coach/safety/silence/room 의 `*Response` records
 */

/* ── 세션 상태 ─────────────────────────────────────────── */

/** `RoomSessionStatus` (backend). */
export type SessionStatus =
  | 'CREATED'
  | 'SCHEDULED'
  | 'WAITING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

/** `SessionConnectionStatus` (backend). */
export type SessionConnectionStatus = 'DISCONNECTED' | 'CONNECTED' | 'RECONNECTING'

/** `SessionNetworkQuality` (backend). */
export type SessionNetworkQuality = 'EXCELLENT' | 'GOOD' | 'POOR' | 'LOST' | 'UNKNOWN'

/** `SessionClientConnectionState` (backend) — 클라이언트가 보고하는 재연결 상태. */
export type SessionClientConnectionState = 'RECONNECTING' | 'RECONNECTED'

/** `SessionTerminationReason` (backend). */
export type SessionTerminationReason =
  | 'NORMAL_COMPLETION'
  | 'USER_REQUEST'
  | 'SAFETY_CONCERN'
  | 'TECHNICAL_ISSUE'
  | 'OTHER'
  | 'TIME_EXPIRED'
  | 'RECONNECT_TIMEOUT'

/** `SessionTerminateRequest.Reason` — 조기 종료 시 클라이언트가 보낼 수 있는 사유만. */
export type SessionTerminateReason = 'USER_REQUEST' | 'SAFETY_CONCERN' | 'TECHNICAL_ISSUE' | 'OTHER'

/* ── REST 응답 ─────────────────────────────────────────── */

/** `SessionJoinResponse` — LiveKit 접속 정보를 여기서 받는다. */
export interface SessionJoinResult {
  sessionId: number
  status: SessionStatus
  userId: number
  joinedAt: string
  alreadyJoined: boolean
  /** 서버에 LiveKit 설정이 없으면 false — url/token 이 null 이다 */
  liveKitConfigured: boolean
  liveKitUrl: string | null
  liveKitAccessToken: string | null
}

/** `SessionParticipantStateResponse`. */
export interface SessionParticipantState {
  userId: number
  joined: boolean
  ready: boolean
  joinedAt: string | null
  connectionStatus: SessionConnectionStatus
  connectedAt: string | null
  disconnectedAt: string | null
  lastHeartbeatAt: string | null
  reconnectingAt: string | null
  reconnectDeadlineAt: string | null
  reconnectedAt: string | null
  recoveryFailedAt: string | null
  reconnectAttemptCount: number
  cameraEnabled: boolean
  microphoneEnabled: boolean
  networkQuality: SessionNetworkQuality
  mediaStateUpdatedAt: string | null
  networkQualityUpdatedAt: string | null
}

/** `SessionStatusResponse` — 서버가 계산한 남은 시간의 SSOT. */
export interface SessionStatusSnapshot {
  sessionId: number
  status: SessionStatus
  scheduledStartAt: string
  actualStartAt: string | null
  /** 서버 계산 잔여 초(연장 반영). 클라이언트 타이머보다 이 값이 우선한다 */
  remainingSeconds: number
  allJoined: boolean
  allReady: boolean
  allConnected: boolean
  /**
   * 분석 동의 플래그 — **요청한 본인 기준**이다(상대 설정이 아니다).
   *
   * 이 두 값이 상태 응답에 실리면서 분석 on/off 에 **읽기 경로**가 생겼다. 예전에는
   * `PATCH /analysis-settings` 의 응답이 유일한 통로였는데, 그 PATCH 는 세션이
   * `IN_PROGRESS` 면 409 라 새로고침·늦은 입장·대기방 우회가 전부 "영구히 꺼짐"으로
   * 끝났다. 이제 3초 폴링이 알아서 복구한다.
   *
   * ⚠️ 서버가 아직 안 내려주면 `undefined` 다 — 호출부에서 폴백을 둔다.
   */
  voiceAnalysisEnabled: boolean
  expressionAnalysisEnabled: boolean
  participants: SessionParticipantState[]
}

/** `SessionDetailResponse`. */
export interface SessionDetail {
  sessionId: number
  matchPairId: number
  status: SessionStatus
  scheduledStartAt: string
  actualStartAt: string | null
  actualEndAt: string | null
  plannedDurationSec: number
  remainingSeconds: number
  participants: { userId: number; nickname: string | null; role: string; status: string }[]
}

/** `SessionEndedResponse` — complete/terminate 응답이자 lifecycle STOMP 페이로드. */
export interface SessionEndedPayload {
  /** 'SESSION_ENDED' */
  eventType: string
  sessionId: number
  status: SessionStatus
  reason: SessionTerminationReason
  endedByUserId: number | null
  endedAt: string
}

/** `SessionAnalysisSettingsResponse`. */
export interface SessionAnalysisSettings {
  sessionId: number
  userId: number
  voiceAnalysisEnabled: boolean
  expressionAnalysisEnabled: boolean
}

/* ── 미션 (MISSION) ────────────────────────────────────── */

/** `SessionMissionStatus` (backend). */
export type SessionMissionStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED'

/** `MissionProgressUnit` (backend). */
export type MissionProgressUnit = 'COUNT' | 'SECONDS'

/** `SessionMissionResponse`. */
export interface SessionMission {
  sessionMissionId: number
  missionCode: string
  title: string
  description: string | null
  status: SessionMissionStatus
  progressValue: number
  targetValue: number
  progressUnit: MissionProgressUnit
  assignedAt: string
  completedAt: string | null
  updatedAt: string | null
}

/** `SessionMissionsResponse`. */
export interface SessionMissions {
  sessionId: number
  userId: number
  missions: SessionMission[]
}

/* ── 질문 카드 (SILENCE) ───────────────────────────────── */

/** `QuestionCardResponse`. */
export interface QuestionCard {
  questionCardId: number
  code: string
  category: string
  content: string
}

/** `QuestionCardListResponse`. */
export interface QuestionCardList {
  sessionId: number
  questions: QuestionCard[]
}

/* ── 실시간 페이로드 (STOMP) ───────────────────────────── */

/** `SessionTimerEventType` (backend). */
export type SessionTimerEventType =
  | 'SESSION_TIMER_TICK'
  | 'SESSION_ENDING_SOON'
  | 'SESSION_ENDING_IMMINENT'
  | 'SESSION_TIME_EXPIRED'

/** `/topic/sessions/{id}/timer` — `SessionTimerEventResponse`. */
export interface SessionTimerEvent {
  eventType: SessionTimerEventType
  sessionId: number
  remainingSeconds: number
  endsAt: string
  occurredAt: string
}

/**
 * `/topic/sessions/{id}/participants` — 두 종류가 같은 토픽으로 온다.
 *  - `SessionParticipantConnectionChangedResponse` (연결 상태 변화)
 *  - `SessionParticipantRealtimeStateChangedResponse` (카메라/마이크/네트워크 변화)
 * `eventType` 문자열로 구분하지 않고, 있는 필드만 읽는다(둘 다 userId/미디어 상태를 가진다).
 */
export interface SessionParticipantEvent {
  eventType: string
  sessionId: number
  userId: number
  connectionStatus?: SessionConnectionStatus
  connectedAt?: string | null
  disconnectedAt?: string | null
  reconnectingAt?: string | null
  reconnectDeadlineAt?: string | null
  reconnectedAt?: string | null
  reconnectAttemptCount?: number
  cameraEnabled: boolean
  microphoneEnabled: boolean
  networkQuality: SessionNetworkQuality
  mediaStateUpdatedAt: string | null
  networkQualityUpdatedAt: string | null
  occurredAt: string
}

/** `CoachingType` (backend). */
export type CoachingType =
  | 'SILENCE_RECOVERY'
  | 'RESPONSE_PROMPT'
  | 'REACTION_PROMPT'
  | 'ATTENTION_RECOVERY'
  | 'VISION_SETUP_GUIDANCE'
  | 'EXPRESSION_GUIDANCE'
  | 'VOLUME_GUIDANCE'

/** `CoachingPriority` (backend). */
export type CoachingPriority = 'LOW' | 'MEDIUM' | 'HIGH'

/** `/user/queue/sessions/{id}/coaching` — `CoachingMessageResponse`. 본인에게만 전달된다. */
export interface CoachingMessageEvent {
  /** 'COACHING_MESSAGE' */
  eventType: string
  eventId: string
  sessionId: number
  coachingType: CoachingType
  messageKey: string
  messageText: string
  priority: CoachingPriority
  reasonCode: string | null
  triggeredAtSessionElapsedMs: number
  expiresAtSessionElapsedMs: number
}

/** `SafetyCategory` (backend). */
export type SafetyCategory =
  | 'EX_PARTNER_REPETITION'
  | 'APPEARANCE_CRITICISM'
  | 'AGE_OR_CONDITION_DISPARAGEMENT'
  | 'MARRIAGE_OR_CHILDBIRTH_PRESSURE'
  | 'SEXUAL_QUESTION'
  | 'REPEATED_BOASTING'
  | 'SARCASM_OR_DISRESPECT'
  | 'AGGRESSIVE_ASSERTION'
  | 'PERSONAL_INFORMATION_REQUEST'
  | 'HATE_OR_DISCRIMINATION'

/** `SafetySeverity` (backend). */
export type SafetySeverity = 'LOW' | 'MEDIUM' | 'HIGH'

/* ── 5분 연장(CONTACT-01) ──────────────────────────────── */

/** 내 의사. 서버 `ContactDecision`. */
export type SessionExtensionDecision = 'AGREE' | 'DECLINE'

/** 양측 합산 결과. 서버 `ContactDecisionStatus`. */
export type SessionExtensionStatus = 'PENDING' | 'AGREED' | 'DECLINED'

/**
 * `POST /sessions/{id}/extensions` 응답이자 `/topic/sessions/{id}/extensions` 이벤트
 * (`SessionExtensionDecisionResponse`).
 *
 * ⚠️ 응답에 **상대의 결정(`targetDecision`)이 들어 있지만 화면에 쓰지 않는다.**
 *    "상대가 거절했다"를 알리지 않는 것이 W-15 규칙이다 — 내가 수락했는데 연장되지 않으면
 *    그냥 세션이 끝날 뿐이고, 사용자는 이유를 구분할 수 없어야 한다.
 */
export interface SessionExtensionEvent {
  eventType: string
  sessionId: number
  status: SessionExtensionStatus
  requesterUserId: number | null
  requesterDecision: SessionExtensionDecision | null
  targetUserId: number | null
  targetDecision: SessionExtensionDecision | null
  sessionStatus: string
  scheduledEndAt: string | null
  actualEndAt: string | null
  occurredAt: string
}

/**
 * 서버가 제출을 받아 주는 창(분). `SessionExtensionDecisionService.DECISION_WINDOW_MINUTES`.
 * 이보다 이르면 `SESSION_EXTENSION_WINDOW_NOT_OPEN` 으로 거절된다.
 */
export const EXTENSION_WINDOW_MINUTES = 5

/** `/user/queue/sessions/{id}/safety` — `SafetyWarningResponse`. */
export interface SafetyWarningEvent {
  /** 'SAFETY_WARNING' */
  eventType: string
  eventId: string
  sessionId: number
  category: SafetyCategory
  severity: SafetySeverity
  message: string
  /** 'CAUTION' 또는 'SHOW_REPORT_OR_LEAVE_OPTIONS' */
  recommendedAction: string
  occurrenceCount: number
}

/** `SilenceInterventionStage` (backend) — 임계값: 15s / 30s / 45s. */
export type SilenceInterventionStage = 'NONE' | 'TOPIC_HINT' | 'QUESTION_CARD' | 'CONTEXTUAL_QUESTIONS'

/** `/topic/sessions/{id}/silence` — `SilenceInterventionResponse`. */
export interface SilenceInterventionEvent {
  /** 'SILENCE_INTERVENTION' */
  eventType: string
  eventId: string
  sessionId: number
  silenceDurationMs: number
  interventionStage: SilenceInterventionStage
  questions: QuestionCard[]
}

/** `/user/queue/sessions/{id}/questions` — `ContextualQuestionRecommendationResponse`. */
export interface ContextualQuestionEvent {
  /** 'CONTEXTUAL_QUESTION_RECOMMENDATION' */
  eventType: string
  eventId: string
  sessionId: number
  /** 맥락 질문은 카드가 아니라 문자열 목록으로 온다 */
  questions: string[]
  expiresAtSessionElapsedMs: number
}

/* ── STOMP destination ─────────────────────────────────── */

/**
 * 구독 가능한 destination.
 * ⚠️ `RoomStompAuthInterceptor` 가 화이트리스트에 없는 destination 을 **전부 거절**한다 —
 *    여기 목록이 서버 정규식과 1:1 이어야 한다.
 */
export const sessionTopics = (sessionId: number) => ({
  timer: `/topic/sessions/${sessionId}/timer`,
  participants: `/topic/sessions/${sessionId}/participants`,
  lifecycle: `/topic/sessions/${sessionId}/lifecycle`,
  silence: `/topic/sessions/${sessionId}/silence`,
  extensions: `/topic/sessions/${sessionId}/extensions`,
  coaching: `/user/queue/sessions/${sessionId}/coaching`,
  questions: `/user/queue/sessions/${sessionId}/questions`,
  safety: `/user/queue/sessions/${sessionId}/safety`,
})

/** 전송 가능한 destination(`/app/...`). */
export const sessionCommands = (sessionId: number) => ({
  heartbeat: `/app/sessions/${sessionId}/heartbeat`,
  connectionState: `/app/sessions/${sessionId}/connection-state`,
  mediaState: `/app/sessions/${sessionId}/media-state`,
  networkQuality: `/app/sessions/${sessionId}/network-quality`,
})

/** 대기방 준비 현황 토픽. */
export const roomParticipantsTopic = (roomId: number) => `/topic/rooms/${roomId}/participants`

/** 침묵 단계(서버) → 기존 화면의 SilenceStage 어휘로 변환. */
export function toSilenceStage(stage: SilenceInterventionStage): 'none' | 'topic' | 'question' | 'coach' {
  switch (stage) {
    case 'TOPIC_HINT':
      return 'topic'
    case 'QUESTION_CARD':
      return 'question'
    case 'CONTEXTUAL_QUESTIONS':
      return 'coach'
    default:
      return 'none'
  }
}

/** 코칭 유형 → 코칭 토스트 톤. 안전 경고가 아닌 일반 코칭은 대체로 개선 제안이다. */
export function toCoachTone(type: CoachingType): 'positive' | 'negative' | 'neutral' {
  switch (type) {
    // 실측 기반 안내는 neutral 이다. tone 은 제목뿐 아니라 **헤지 배지**도 결정하는데
    // (CoachOverlay 의 `hedge={tone !== 'neutral'}`), negative 로 두면 dBFS 실측값에
    // "ⓘ AI 추정 · 참고용" 이 붙어 표기가 사실과 어긋난다.
    // 카메라 안내(VISION_SETUP_GUIDANCE)가 같은 이유로 이미 neutral 이다.
    case 'VISION_SETUP_GUIDANCE':
    case 'VOLUME_GUIDANCE':
      return 'neutral'
    case 'EXPRESSION_GUIDANCE':
    case 'REACTION_PROMPT':
    case 'RESPONSE_PROMPT':
    case 'SILENCE_RECOVERY':
    case 'ATTENTION_RECOVERY':
      return 'negative'
    default:
      return 'neutral'
  }
}
