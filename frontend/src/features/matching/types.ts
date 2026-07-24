/**
 * 매칭(F2 · MATCH-01~06) 도메인 타입.
 * ERD(match_requests · match_pairs · match_responses · user_profiles · user_availability_slots) 기준.
 *
 * ⚠️ 매칭 근거 비공개(D-21): match_pairs 의 점수 필드(total·goal·conversation·schedule·preference)는
 *    응답 DTO에서 제외한다 — 이 타입에도 의도적으로 넣지 않는다.
 * ⚠️ 최소 공개: 상대 정보는 닉네임·연령대·얼굴상만. 실명·전화·지역·키 금지(키 미수집).
 */

/** 트랙 3분기. 실사용자만 대기 큐를 쓰고, AI화상·챗봇은 별도 진입(큐는 유지). */
export type MatchTrack = 'REAL' | 'AI_VIDEO' | 'CHATBOT'

export type MatchRequestStatus = 'WAITING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED'
export type MatchPairStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONFIRMED'
export type MatchResponse = 'ACCEPTED' | 'REJECTED'

/** 대기 지연 원인(원인별 안내 분기). */
export type DelayReason = 'SLOT_NARROW' | 'AGE_RANGE' | 'CANDIDATE_SHORTAGE'

/** 큐 등록 응답. */
export interface MatchRequest {
  matchRequestId: string
  status: MatchRequestStatus
  requestedAt: string
}

/** 현재 매칭 조건 요약(W-09b 우측). */
export interface MatchConditions {
  minPreferredAge: number
  maxPreferredAge: number
  /** 활성 가능 시간대 슬롯 수 */
  availableSlotCount: number
  /** 희망 시작~끝(오늘) — 없을 수 있음 */
  preferredStartAt?: string | null
  preferredEndAt?: string | null
  /** 제외 조건 — 차단 수 */
  blockedCount: number
}

/** 대기 큐 상태(GET /match/requests/{id}). */
export interface QueueStatus {
  matchRequestId: string
  status: MatchRequestStatus
  /** 대기열 순번(1-base) */
  position: number
  requestedAt: string
  conditions: MatchConditions
  /** 지연 안내(없으면 정상 대기) */
  delayReason?: DelayReason | null
  /** 성립 시 이동할 매칭 페어 id (match-found 이벤트로 채워짐) */
  matchedPairId?: string | null
}

/** 상대 프로필(공개 필드만). */
export interface OpponentProfile {
  nickname: string
  /** 연령대 파생(예: "20대 후반") — 원본 나이 금지 */
  ageBand: string
  /** 1순위 얼굴상(항상 공개) — 이모지+이름 (예: "🐰 토끼상") */
  faceTag: string
}

/** 매칭 카드의 세션 정보. */
export interface MatchSessionInfo {
  sessionId: string
  scheduledStartAt: string
  plannedDurationMin: number
  themeName: string
  themeEmoji: string
  /** 내 개선 목표(온보딩 '고치고 싶은 점') — 상대가 아니라 내 목표 */
  myPracticeGoal: string
}

/** 매칭 카드(GET /match/pairs/{id}). */
export interface MatchPair {
  matchPairId: string
  status: MatchPairStatus
  /** 수락 제한 시각(ISO) — 카운트다운 기준 */
  acceptDeadlineAt: string
  opponent: OpponentProfile
  session: MatchSessionInfo
  /** 상대 수락 현황 */
  opponentAccepted: boolean
  /** 내 응답(없으면 대기) */
  myResponse?: MatchResponse | null
}
