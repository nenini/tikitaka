/**
 * 상호 평가(RESULT · W-14 / `RESULT-02`) 도메인 타입.
 * ERD `peer_evaluations` 기준.
 *
 * ⚠️ 원칙: **대화 행동만** 평가한다. 외모·조건·매력 항목은 어떤 형태로도 추가하지 않는다.
 * 🔒 상호성 게이트는 서버가 최종 판정한다 — 클라이언트는 `ReceivedReviewStatus.unlocked` 를 신뢰만 하고,
 *    숨김 처리로 잠금을 대신하지 않는다.
 */

/** 정량 6항목. peer_evaluations 의 `*Score` 필드와 1:1 대응한다. */
export type PeerReviewMetricKey =
  | 'comfort'
  | 'questionConnection'
  | 'listening'
  | 'reaction'
  | 'balance'
  | 'manner'

export interface PeerReviewMetricDef {
  key: PeerReviewMetricKey
  /** 항목명 (예: "대화의 편안함") */
  label: string
  /** 판단 기준 한 줄 (예: "긴장되지 않고 편하게 이야기했나요?") */
  help: string
}

/**
 * 평가 항목은 서버(peer-review-form)가 내려주는 것이 원칙이지만,
 * 6항목 자체는 ERD 컬럼으로 고정돼 있어 폴백/정렬 기준으로 여기에 둔다.
 * 서버가 순서를 바꿔 내려주면 서버 순서를 따른다.
 */
export const PEER_REVIEW_METRICS: readonly PeerReviewMetricDef[] = [
  { key: 'comfort', label: '대화의 편안함', help: '긴장되지 않고 편하게 이야기했나요?' },
  { key: 'questionConnection', label: '질문 연결성', help: '질문이 자연스럽게 이어졌나요?' },
  { key: 'listening', label: '경청 태도', help: '내 말을 잘 들어주었나요?' },
  { key: 'reaction', label: '리액션', help: '적절히 반응해주었나요?' },
  { key: 'balance', label: '대화 균형', help: '발화량이 한쪽으로 치우치지 않았나요?' },
  { key: 'manner', label: '매너', help: '존중받는 느낌이었나요?' },
] as const

/** 서술형 최대 길이. 서버 검증이 정본이고 여기서는 입력 단계 안내용. */
export const PEER_REVIEW_TEXT_MAX = 500

export type PeerReviewScores = Partial<Record<PeerReviewMetricKey, number>>

/** GET /sessions/{id}/peer-review-form */
export interface PeerReviewForm {
  sessionId: string
  /** 평가 대상(상대). 신고·차단에 userId 가 필요하다 */
  opponent: { userId: string; nickname: string }
  /** 몇 회차 세션인지 (헤더 배지) */
  sessionRoundNo: number
  durationMin: number
  metrics: PeerReviewMetricDef[]
  /** 상호성 게이트 마감(ISO) — 세션 종료 +48h */
  submitDeadlineAt: string
  /** 내가 이미 제출했는지 */
  submitted: boolean
}

/** POST /sessions/{id}/peer-reviews 본문. 서술형 2종은 **선택**. */
export interface PeerReviewSubmission {
  scores: Record<PeerReviewMetricKey, number>
  goodBehaviorText?: string
  improvementText?: string
}

/** GET /sessions/{id}/peer-reviews/received/status — 상호성 게이트 상태. */
export interface ReceivedReviewStatus {
  /** 내가 제출했는가 (게이트 통과 조건) */
  mySubmitted: boolean
  /** 상대가 제출했는가 */
  opponentSubmitted: boolean
  /** 서버 최종 판정 — 이 값이 true 일 때만 받은 평가를 조회한다 */
  unlocked: boolean
  /** 48h 마감(ISO) */
  deadlineAt: string
  /** 마감이 지나 영구 확정됐는가 (지각 제출은 반영하지 않는다) */
  expired: boolean
}

/** GET /sessions/{id}/peer-reviews/received — 익명으로 전달되는 상대의 평가. */
export interface ReceivedReview {
  reviewId: string
  scores: Record<PeerReviewMetricKey, number>
  goodBehaviorText?: string | null
  improvementText?: string | null
  submittedAt: string
}

/** 평가 내용 신고(POST .../peer-reviews/{reviewId}/report) · 사용자 신고(MODERATION) 공통 사유. */
export interface ReportTypeOption {
  code: string
  label: string
}

/** MODERATION 도메인의 report-types 가 비어 있을 때 쓰는 폴백 목록. */
export const FALLBACK_REPORT_TYPES: readonly ReportTypeOption[] = [
  { code: 'ABUSIVE_LANGUAGE', label: '욕설·비하 표현' },
  { code: 'SEXUAL_HARASSMENT', label: '성적 불쾌감을 주는 언행' },
  { code: 'HATE_DISCRIMINATION', label: '혐오·차별 발언' },
  { code: 'PRESSURE', label: '결혼·출산·외모 등 압박' },
  { code: 'COMMERCIAL', label: '홍보·영업·외부 유도' },
  { code: 'IMPERSONATION', label: '사진·프로필과 다른 사람' },
  { code: 'ETC', label: '기타' },
] as const
