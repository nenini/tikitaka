/**
 * 상호 평가(RESULT · W-14 / `RESULT-02`) 도메인 타입.
 *
 * 백엔드 SSOT: `PeerEvaluationController` + `result/dto/*`
 *   GET  /api/v1/sessions/{sessionId}/evaluations/items
 *   GET  /api/v1/sessions/{sessionId}/evaluations/status
 *   POST /api/v1/sessions/{sessionId}/evaluations
 *   GET  /api/v1/sessions/{sessionId}/evaluations/result
 *
 * ⚠️ 원칙: **대화 행동만** 평가한다. 외모·조건·매력 항목은 어떤 형태로도 추가하지 않는다.
 * 🔒 상호성 게이트는 서버가 최종 판정한다 — 클라이언트는 `EvaluationStatus.resultAvailable` 을
 *    신뢰만 하고, 숨김 처리로 잠금을 대신하지 않는다.
 */

/**
 * 정량 6항목. 값은 백엔드 `EvaluationItem.key` 를 그대로 쓴다 —
 * 이 문자열이 곧 제출 본문(`PeerEvaluationSubmitRequest`)의 필드명이라,
 * 별도 이름을 두면 제출할 때마다 매핑 테이블이 하나 더 생긴다.
 */
export type EvaluationItemKey =
  | 'comfortScore'
  | 'questionConnectionScore'
  | 'listeningScore'
  | 'reactionScore'
  | 'balanceScore'
  | 'mannerScore'

/** `EvaluationItemsResponse.items` 의 원소(EvaluationItemResponse). */
export interface EvaluationItemDef {
  key: EvaluationItemKey
  /** 서버가 주는 항목 문구 (예: "대화가 편안했어요") */
  label: string
  minScore: number
  maxScore: number
}

/**
 * 항목별 판단 기준 한 줄.
 * 서버는 `label` 만 주므로 화면 보조 문구는 프론트가 붙인다.
 * 서버가 모르는 key 를 내려주면 보조 문구 없이 label 만 그린다.
 */
export const EVALUATION_ITEM_HELP: Readonly<Partial<Record<EvaluationItemKey, string>>> = {
  comfortScore: '긴장되지 않고 편하게 이야기했나요?',
  questionConnectionScore: '질문이 자연스럽게 이어졌나요?',
  listeningScore: '내 말을 잘 들어주었나요?',
  reactionScore: '적절히 반응해주었나요?',
  balanceScore: '발화량이 한쪽으로 치우치지 않았나요?',
  mannerScore: '존중받는 느낌이었나요?',
}

/**
 * 서술형 최대 길이 폴백. 정본은 `EvaluationItems.maxTextLength`(서버 값)이고,
 * 이 상수는 아직 응답이 오기 전 입력 단계 안내용이다.
 */
export const EVALUATION_TEXT_MAX = 1000

/** GET .../evaluations/items (EvaluationItemsResponse). */
export interface EvaluationItems {
  sessionId: number
  /** 평가 대상(상대). 닉네임은 여기 없어서 공개 프로필을 따로 조회한다. */
  partnerUserId: number
  items: EvaluationItemDef[]
  maxTextLength: number
}

/**
 * GET .../evaluations/status (EvaluationStatusResponse).
 *
 * ⚠️ `deadlineAt` 은 Java `LocalDateTime` 이라 오프셋 없는 `yyyy-MM-ddTHH:mm:ss` 로 온다.
 *    `new Date()` 가 이를 **브라우저 로컬 시각**으로 해석하므로, 서버와 사용자의
 *    시간대가 다르면 마감 표시가 어긋난다. 남은 시간은 `remainingSeconds` 를 쓰는 편이 안전하다.
 */
export interface EvaluationStatus {
  sessionId: number
  mySubmitted: boolean
  partnerSubmitted: boolean
  allSubmitted: boolean
  deadlineAt: string
  remainingSeconds: number
  /** 아직 낼 수 있는가 = 미제출 && 마감 전 */
  submissionOpen: boolean
  /** 받은 평가를 열 수 있는가 = 양측 제출 완료 (서버 최종 판정) */
  resultAvailable: boolean
  /** 내가 안 낸 채 마감이 지나 영구히 못 보게 됐는가 */
  resultPermanentlyLocked: boolean
}

export type EvaluationScores = Record<EvaluationItemKey, number>

/** POST .../evaluations 본문. 점수는 중첩 없이 평탄하게 올라간다. */
export type EvaluationSubmitPayload = EvaluationScores & {
  goodBehaviorText?: string
  improvementText?: string
}

/** POST .../evaluations 응답(PeerEvaluationSubmitResponse). */
export interface EvaluationSubmitResult {
  evaluationId: number
  sessionId: number
  status: string
  allSubmitted: boolean
  /** 양측 완료 이벤트 발행 여부이며 리포트 생성 완료가 아니다. */
  reportRequested: boolean
  submittedAt: string
}

/**
 * GET .../evaluations/result — **내가 받은** 평가(PeerEvaluationResultResponse).
 * 익명으로 전달되며, 양측이 모두 제출해야 열린다.
 */
export type ReceivedEvaluation = EvaluationScores & {
  sessionId: number
  goodBehaviorText: string | null
  improvementText: string | null
  submittedAt: string
}

/* ── 신고 · 차단(MODERATION) ───────────────────────────── */

/**
 * 백엔드 `ModerationReportReason` enum.
 * 목록 조회 API 가 없어(서버가 enum 을 노출하지 않는다) 프론트 상수로 둔다 —
 * 백엔드에서 값을 추가하면 여기도 함께 고쳐야 한다.
 */
export type ModerationReasonCode =
  | 'INAPPROPRIATE_LANGUAGE'
  | 'HARASSMENT'
  | 'SEXUAL_CONTENT'
  | 'THREAT'
  | 'FRAUD'
  | 'OTHER'

export interface ModerationReasonOption {
  code: ModerationReasonCode
  label: string
}

export const MODERATION_REASONS: readonly ModerationReasonOption[] = [
  { code: 'INAPPROPRIATE_LANGUAGE', label: '욕설·비하 표현' },
  { code: 'HARASSMENT', label: '괴롭힘·불쾌한 언행' },
  { code: 'SEXUAL_CONTENT', label: '성적 불쾌감을 주는 언행' },
  { code: 'THREAT', label: '위협·협박' },
  { code: 'FRAUD', label: '사기·허위·홍보' },
  { code: 'OTHER', label: '기타' },
] as const

/** 신고 상세는 서버에서 `@NotBlank @Size(max=2000)` 이라 **필수**다. */
export const MODERATION_DETAIL_MAX = 2000
