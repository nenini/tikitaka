/**
 * 상황형 대기방(W-11 · ROOM-01/03) 데이터 타입.
 * ERD(room_themes · sessions · session_participants · user_practice_goals) 기준.
 * 기기 점검 자체는 클라 전용이라 서버 저장이 없고, 여기서는 "테마·목표 번들"만 다룬다.
 */

/** room_themes — scheduledStartAt 시간대로 자동 배정되는 상황(장소) 테마. */
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

/** GET /api/sessions/{id}/room 응답 — 대기방에 필요한 테마·일정·목표 번들. */
export interface RoomBundle {
  sessionId: string
  /** 세션 예정 시작 시각(ISO) — 남은 시간 카운트다운 기준 */
  scheduledStartAt: string
  theme: RoomTheme
  /** user_practice_goals — 온보딩에서 고른 "고치고 싶은 점"(세션 목표). 없을 수 있음 */
  practiceGoal?: string | null
}

/** 개별 기기 점검 상태. */
export type DeviceStatus =
  | 'idle' // 아직 점검 전
  | 'checking' // 권한 요청/초기화 중
  | 'ready' // 정상
  | 'error' // 장치 없음/권한 거부/사용 중

/** 대기방 기기 점검 종합 결과. */
export interface DeviceCheckState {
  camera: DeviceStatus
  microphone: DeviceStatus
  /** 스피커는 사용자가 테스트음으로 직접 확인 → 재생 중 여부만 관리 */
  speakerPlaying: boolean
  /** 사용자에게 보여줄 오류 사유(권한 거부 등). 없으면 null */
  errorReason: string | null
}
