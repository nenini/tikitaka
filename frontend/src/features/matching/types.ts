/**
 * 매칭(F2 · MATCH) 도메인 타입.
 *
 * 백엔드 SSOT
 *  - `match/api/MatchRequestController.java`  → /api/v1/match-requests
 *  - `match/api/MatchController.java`         → /api/v1/matches
 *  - DTO: MatchRequestSaveRequest / MatchRequestResponse / MatchResultResponse
 *
 * ⚠️ 매칭 근거 비공개(D-21): 백엔드 `MatchResultResponse` 는 `faceScore·traitScore·totalScore` 를
 *    내려주지만 **뷰모델에 담지 않는다** — 담아두면 언젠가 화면에 새어 나간다.
 * ⚠️ 최소 공개: 백엔드는 `partnerProfile` 에 원본 `age` 와 `regionCity` 를 준다.
 *    뷰모델에는 연령대(`ageBand`)만 남기고 원본 나이·지역은 버린다.
 * ⚠️ 상대 거절 비공개: 백엔드 `partnerResponse` 는 REJECTED 를 그대로 주지만,
 *    뷰모델은 `opponentAccepted: boolean` 만 노출한다(거절 여부를 화면에서 구분할 수 없게).
 */

/* ── 백엔드 enum 그대로 ────────────────────────────────── */

/** `MatchRequestStatus` (backend). 기존 FE 의 `MATCHED` 는 없다 — 성립은 `MATCH_FOUND`. */
export type MatchRequestStatus =
  | 'WAITING'
  | 'MATCH_FOUND'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'

/** `MatchStatus` (backend). 최초 상태는 `PENDING_ACCEPTANCE`. */
export type MatchStatus =
  | 'PENDING_ACCEPTANCE'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'

/** `MatchResponseStatus` (backend). */
export type MatchResponseStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED'

/** `java.time.DayOfWeek` 직렬화 값. */
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'

/** 트랙 3분기. **화면 개념일 뿐 백엔드에는 없다** — 큐 등록은 실사용자 트랙 전용이다. */
export type MatchTrack = 'REAL' | 'AI_VIDEO' | 'CHATBOT'

/* ── 요청 ──────────────────────────────────────────────── */

/** `MatchRequestSlotInput` — `startTime`/`endTime` 은 `LocalTime`(`HH:mm`). */
export interface AvailableSlot {
  dayOfWeek: DayOfWeek
  /** 'HH:mm' */
  startTime: string
  /** 'HH:mm' */
  endTime: string
}

/**
 * `MatchRequestSaveRequest` — POST /match-requests · PUT /match-requests/me/current 공통 바디.
 *
 * ⚠️ PUT 은 **부분 수정이 아니라 전체 교체**다. 모든 필드가 `@NotNull` 이므로
 *    조건 완화도 슬롯을 함께 다시 보내야 한다.
 * ⚠️ 슬롯 제약(서버 검증): 1~14개 · 중복 금지 · 같은 요일 시간 겹침 금지 · start < end.
 */
export interface MatchRequestInput {
  preferredAgeMin: number
  preferredAgeMax: number
  availableSlots: AvailableSlot[]
}

/* ── 응답(원본) ────────────────────────────────────────── */

/** `MatchFaceSnapshotResponse` · `MatchTraitSnapshotResponse` 공통 모양. */
export interface CatalogRef {
  id: number
  code: string
  name: string
}

/** `MatchRequestResponse` 원본. 날짜는 서버 `LocalDateTime`(타임존 없음). */
export interface RawMatchRequest {
  matchRequestId: number
  status: MatchRequestStatus
  preferredAgeMin: number
  preferredAgeMax: number
  preferredFaceTag: CatalogRef | null
  actualFaceTag: CatalogRef | null
  preferredTraits: CatalogRef[]
  selfTraits: CatalogRef[]
  availableSlots: AvailableSlot[]
  requestedAt: string
  waitingStartedAt: string | null
  matchedAt: string | null
  cancelledAt: string | null
  rejectedAt: string | null
}

/** `PublicProfileResponse` 원본. */
export interface RawPublicProfile {
  nickname: string
  gender: 'MALE' | 'FEMALE'
  regionCity: string | null
  age: number
}

/** `MatchResultResponse` 원본. 점수 3종은 의도적으로 선언하지 않는다(D-21). */
export interface RawMatchResult {
  matchPairId: number
  roomId: number | null
  status: MatchStatus
  myResponse: MatchResponseStatus
  partnerResponse: MatchResponseStatus
  partnerProfile: RawPublicProfile | null
  acceptDeadlineAt: string | null
  matchedAt: string | null
  proposedScheduledAt: string | null
  scheduledAt: string | null
  confirmedAt: string | null
}

/* ── 뷰모델 ────────────────────────────────────────────── */

/**
 * 지연 안내 사유. 백엔드 미구현(스펙의 `GET /match-requests/{id}/delay-reason` 없음) →
 * 지금은 항상 null 이다. 서버가 붙으면 매핑만 채우면 화면은 그대로 동작한다.
 */
export type DelayReason = 'SLOT_NARROW' | 'AGE_RANGE' | 'CANDIDATE_SHORTAGE'

/** W-09b 우측 "현재 매칭 조건" 패널이 그리는 값. */
export interface MatchConditions {
  preferredAgeMin: number
  preferredAgeMax: number
  availableSlots: AvailableSlot[]
  /** 설문에서 고른 선호 얼굴상(요청 시점 스냅샷) */
  preferredFaceTag: CatalogRef | null
  /** 설문에서 고른 선호 성격 3개(요청 시점 스냅샷) */
  preferredTraits: CatalogRef[]
}

/** 대기 큐 상태 뷰모델. */
export interface QueueStatus {
  matchRequestId: number
  status: MatchRequestStatus
  /** ISO(UTC) */
  requestedAt: string
  conditions: MatchConditions
  /** 매칭이 성립됐는가 — `MATCH_FOUND` 이상 */
  matched: boolean
  /** 서버 미제공 → 항상 null */
  delayReason: DelayReason | null
}

/** 상대 프로필(공개 필드만). */
export interface OpponentProfile {
  nickname: string
  /** 연령대 파생값(예: "20대 후반"). 원본 나이는 담지 않는다 */
  ageBand: string
  /**
   * 1순위 얼굴상. 백엔드 `MatchResultResponse.partnerProfile` 에 얼굴상이 없어
   * 현재는 항상 null 이다(상대 얼굴상 노출 엔드포인트 없음).
   */
  faceTag: string | null
}

/** 매칭 카드의 세션 정보. */
export interface MatchSessionInfo {
  /** `roomId` == `sessionId` (WaitingRoom 엔티티가 `sessions` 테이블, PK `sessionId`) */
  sessionId: number | null
  /** ISO(UTC). 확정 전에는 `proposedScheduledAt` 를 쓴다 */
  scheduledStartAt: string | null
  /** 서버 미제공 → 기본 30분 (`sessions.plannedDurationSec` 는 세션 조회에서만 온다) */
  plannedDurationMin: number
  /** 서버 미제공 → 시간대 기준 클라이언트 배정값 */
  themeName: string | null
  themeEmoji: string | null
  /** 내 개선 목표(온보딩 설문 `practiceGoals[0]`) */
  myPracticeGoal: string | null
}

/** 매칭 카드 뷰모델. */
export interface MatchPair {
  matchPairId: number
  status: MatchStatus
  /** ISO(UTC). 서버가 안 주면 null → 카운트다운을 그리지 않는다 */
  acceptDeadlineAt: string | null
  opponent: OpponentProfile
  session: MatchSessionInfo
  /** 상대 수락 현황. **거절은 표현하지 않는다**(수락했는가 / 아직인가 뿐) */
  opponentAccepted: boolean
  /** 내 응답 */
  myResponse: MatchResponseStatus
}

/** 매칭이 더 이상 진행되지 않는 종료 상태인가. 사유(누가 거절했는지)는 구분하지 않는다. */
export function isMatchClosed(status: MatchStatus): boolean {
  return status === 'REJECTED' || status === 'CANCELLED' || status === 'EXPIRED'
}

/* ── 표시 헬퍼 ─────────────────────────────────────────── */

/**
 * 원본 나이 → 연령대 표기. 상대에게 정확한 나이를 노출하지 않기 위한 파생값이다.
 * 백엔드가 `age` 원본을 주므로 변환은 클라이언트 몫이다.
 */
export function toAgeBand(age: number | null | undefined): string {
  if (age == null || Number.isNaN(age)) return '비공개'
  const decade = Math.floor(age / 10) * 10
  const withinDecade = age % 10
  const part = withinDecade < 4 ? '초반' : withinDecade < 7 ? '중반' : '후반'
  return `${decade}대 ${part}`
}

export const WEEKDAY_LABEL: Record<DayOfWeek, string> = {
  MONDAY: '월',
  TUESDAY: '화',
  WEDNESDAY: '수',
  THURSDAY: '목',
  FRIDAY: '금',
  SATURDAY: '토',
  SUNDAY: '일',
}

export const WEEKDAY_ORDER: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

/** 슬롯 목록 → "금·토·일 19:00~22:00" 같은 요약 한 줄. */
export function summarizeSlots(slots: AvailableSlot[]): string {
  if (slots.length === 0) return '미설정'
  const byRange = new Map<string, DayOfWeek[]>()
  for (const slot of slots) {
    const key = `${slot.startTime.slice(0, 5)}~${slot.endTime.slice(0, 5)}`
    const days = byRange.get(key) ?? []
    days.push(slot.dayOfWeek)
    byRange.set(key, days)
  }
  return [...byRange.entries()]
    .map(([range, days]) => {
      const sorted = WEEKDAY_ORDER.filter((day) => days.includes(day)).map((day) => WEEKDAY_LABEL[day])
      return `${sorted.join('·')} ${range}`
    })
    .join(' / ')
}

/**
 * 큐 등록 기본 시간대.
 *
 * ⚠️ W-07(가능 시간대 입력) 화면이 아직 없다. 백엔드는 슬롯을 **필수**로 요구하므로
 *    (`@NotNull @Size(min=1,max=14)`) 값이 없으면 등록 자체가 400 이다.
 *    그래서 트랙 선택 화면에서 최소 입력을 받고, 그 초기값으로 이 프리셋을 쓴다.
 */
export const DEFAULT_SLOT_START = '19:00'
export const DEFAULT_SLOT_END = '22:00'
export const DEFAULT_SLOT_DAYS: DayOfWeek[] = ['FRIDAY', 'SATURDAY', 'SUNDAY']

/** 서버 슬롯 상한(`@Size(max = 14)`). */
export const MAX_AVAILABLE_SLOTS = 14

/** 요일 + 공통 시간대 → 슬롯 배열(요일 순 정렬). */
export function buildSlots(days: DayOfWeek[], startTime: string, endTime: string): AvailableSlot[] {
  return WEEKDAY_ORDER.filter((day) => days.includes(day)).map((dayOfWeek) => ({
    dayOfWeek,
    startTime,
    endTime,
  }))
}
