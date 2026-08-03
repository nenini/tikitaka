/**
 * 상황형 대기방(W-11 · ROOM) 데이터 타입.
 *
 * 백엔드 SSOT
 *  - `room/api/WaitingRoomController.java` → /api/v1/rooms
 *  - DTO: WaitingRoomDetailResponse / RoomDeviceCheckRequest·Response / RoomParticipantsStatusResponse
 *
 * 💡 `roomId` 와 `sessionId` 는 **같은 값**이다 — `WaitingRoom` 엔티티가 `sessions` 테이블에
 *    매핑되고 PK 컬럼명이 `sessionId` 다. 라우트는 `/session/:sessionId/room` 을 그대로 쓴다.
 */

/* ── 백엔드 enum ───────────────────────────────────────── */

/** `RoomSessionStatus` (backend). */
export type RoomSessionStatus =
  | 'CREATED'
  | 'SCHEDULED'
  | 'WAITING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

/** `RoomEntryStatus` (backend) — 서버가 판정하는 입장 게이트. */
export type RoomEntryStatus =
  | 'TOO_EARLY'
  | 'AVAILABLE'
  | 'TOO_LATE'
  | 'ROOM_IN_PROGRESS'
  | 'ROOM_COMPLETED'
  | 'ROOM_CANCELLED'

/* ── 테마 (클라이언트 배정) ────────────────────────────── */

/**
 * 상황(장소) 테마.
 *
 * ⚠️ 백엔드에 `room_themes` 를 내려주는 엔드포인트가 **없다**. 대기방 화면은 테마로 그려지므로
 *    예정 시각의 "시"를 기준으로 클라이언트가 배정한다. 서버가 테마를 내려주기 시작하면
 *    `themeForHour` 호출만 서버 값으로 바꾸면 된다.
 */
export interface RoomTheme {
  roomThemeId: number
  /** 표시명 (예: "저녁 식당") */
  name: string
  /** 장소 유형 (예: "RESTAURANT") */
  placeType: string
  /** 배경 이미지 URL (없으면 그라디언트 폴백) */
  backgroundUrl?: string | null
  /** 배경음(앰비언스) 오디오 URL */
  ambienceAudioUrl?: string | null
  /** 자동 배정 시간대 시작(HH:mm) */
  startTime: string
  /** 자동 배정 시간대 끝(HH:mm) */
  endTime: string
}

/* ── 응답(원본) ────────────────────────────────────────── */

/** `RoomParticipantSummaryResponse`. */
export interface RoomParticipantSummary {
  userId: number
  nickname: string | null
  /** `session_participants.participationStatus` 원문 */
  participationStatus: string
}

/** `WaitingRoomDetailResponse` 원본. */
export interface RawWaitingRoom {
  roomId: number
  matchPairId: number
  status: RoomSessionStatus
  scheduledAt: string
  enterableFrom: string
  enterableUntil: string
  canEnter: boolean
  entryStatus: RoomEntryStatus
  participants: RoomParticipantSummary[]
}

/** `RoomDeviceCheckResponse` 원본. */
export interface RawDeviceCheckResult {
  deviceCheckId: number
  roomId: number
  userId: number
  cameraPassed: boolean
  microphonePassed: boolean
  speakerPassed: boolean
  networkPassed: boolean
  /** 4개 항목 모두 통과했는가 — 준비 완료(ready) 가능 여부 */
  readyAvailable: boolean
  checkedAt: string
}

/** `RoomParticipantReadyStatusResponse`. */
export interface RoomParticipantReadyStatus {
  userId: number
  nickname: string | null
  ready: boolean
}

/** `RoomParticipantsStatusResponse` — GET /rooms/{id}/participants/status 및 ready 토글 응답. */
export interface RoomParticipantsStatus {
  roomId: number
  allReady: boolean
  participants: RoomParticipantReadyStatus[]
}

/**
 * STOMP `/topic/rooms/{roomId}/participants` 페이로드.
 * SSOT: `RoomParticipantStatusChangedResponse` — `eventType` 은 `PARTICIPANT_READY_CHANGED`.
 */
export interface RoomParticipantStatusChangedEvent {
  eventType: string
  roomId: number
  changedUserId: number
  ready: boolean
  allReady: boolean
  participants: RoomParticipantReadyStatus[]
  occurredAt: string
}

/* ── 뷰모델 ────────────────────────────────────────────── */

/** 대기방 화면이 그리는 묶음. 서버 응답 + 클라이언트 배정 테마 + 설문 목표. */
export interface RoomBundle {
  roomId: number
  matchPairId: number
  status: RoomSessionStatus
  /** ISO(UTC) — 남은 시간 카운트다운 기준 */
  scheduledStartAt: string
  /** ISO(UTC) */
  enterableFrom: string | null
  enterableUntil: string | null
  /** 서버 판정 — 이 값이 false 면 입장 버튼을 열지 않는다 */
  canEnter: boolean
  entryStatus: RoomEntryStatus
  participants: RoomParticipantSummary[]
  /** 클라이언트가 시간대로 배정한 테마 */
  theme: RoomTheme
  themeEmoji: string
  /** 온보딩 설문 `practiceGoals[0]`. 세션별 목표 엔드포인트는 백엔드에 없다 */
  practiceGoal: string | null
}

/** 입장 게이트 사유 → 사용자 안내 문구. */
export const ENTRY_STATUS_TEXT: Record<RoomEntryStatus, string> = {
  AVAILABLE: '',
  TOO_EARLY: '아직 입장 시간이 아니에요. 시작 시각이 가까워지면 입장할 수 있어요.',
  TOO_LATE: '입장 가능 시간이 지났어요. 노쇼로 처리될 수 있어요.',
  ROOM_IN_PROGRESS: '세션이 이미 진행 중이에요. 바로 들어갈 수 있어요.',
  ROOM_COMPLETED: '이미 끝난 세션이에요.',
  ROOM_CANCELLED: '취소된 세션이에요.',
}

/* ── 기기 점검 ─────────────────────────────────────────── */

/** 개별 기기 점검 상태. */
export type DeviceStatus =
  | 'idle' // 아직 점검 전
  | 'checking' // 권한 요청/초기화 중
  | 'ready' // 정상
  | 'error' // 장치 없음/권한 거부/사용 중

/**
 * 서버에 보낼 기기 점검 결과(`RoomDeviceCheckRequest`).
 * ⚠️ 4개 항목 모두 `@NotNull` 이고, 모두 true 여야 `readyAvailable` 이 된다.
 */
export interface DeviceCheckPayload {
  cameraPassed: boolean
  microphonePassed: boolean
  speakerPassed: boolean
  networkPassed: boolean
}
