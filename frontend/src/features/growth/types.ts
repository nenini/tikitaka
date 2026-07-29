/**
 * 성장 대시보드(GROWTH · W-17 / `GROWTH-01`) 도메인 타입.
 * ERD `love_temperature_histories` · `user_love_temperatures` · `sessions.sessionType` ·
 * `session_reports.strengthsJson · improvementsJson` · `user_badges` + `badge_catalog` ·
 * `attendance_penalties` 기준.
 *
 * ⚠️ 온도는 **우열이 아니라 성장 지표**로 표현한다. 등수·백분위·상대 비교 필드를 두지 않고,
 *    상대의 정확한 온도도 여기서 다루지 않는다.
 * ⚠️ AI 트랙은 실사용자 세션과 **같은 선으로 합치지 않는다** — 점마다 트랙을 들고 다닌다.
 */

/** 화면 필터. 서버 쿼리(track=)와 클라이언트 필터에 같은 값을 쓴다. */
export type GrowthTrack = 'ALL' | 'REAL' | 'AI'

/** 세션 트랙 원본값(sessions.sessionType). AI_VIDEO·CHATBOT 은 화면에서 'AI' 로 묶인다. */
export type SessionType = 'REAL' | 'AI_VIDEO' | 'CHATBOT'

/** 온도 추이 한 점 = 세션 1회(love_temperature_histories 1행). */
export interface TemperaturePoint {
  sessionId: string
  /** 화면 표기용 회차(1-base) */
  sessionNo: number
  sessionType: SessionType
  /** 이 세션 직후 온도 */
  temperatureAfter: number
  /** 증감 */
  delta: number
  createdAt: string
}

/** GET /users/me/growth-dashboard */
export interface GrowthDashboard {
  /** 현재 온도(user_love_temperatures.currentTemperature) */
  currentTemperature: number
  /** 가장 최근 세션의 증감 — 헤더 배지 */
  recentDelta: number
  completedSessionCount: number
  realSessionCount: number
  aiSessionCount: number
  /** attendance_penalties 누계 */
  noShowCount: number
  badgeCount: number
  history: TemperaturePoint[]
}

/** 누적 강점/보완 키워드(리포트 JSON 집계). */
export interface GrowthKeyword {
  label: string
  count: number
}

/** user_badges + badge_catalog. */
export interface EarnedBadge {
  code: string
  name: string
  /** 카탈로그 이모지 (없으면 화면에서 기본값 사용) */
  emoji?: string | null
  /** 획득 조건 설명 — 툴팁/보조 설명 */
  condition?: string | null
  acquiredAt: string
}

/** 온도 게이지 상한. 사랑의 온도는 0~100 스케일로 다룬다. */
export const TEMPERATURE_MAX = 100

/** 트랙 필터가 이 점을 포함하는가. */
export function matchesTrack(point: TemperaturePoint, track: GrowthTrack): boolean {
  if (track === 'ALL') return true
  if (track === 'REAL') return point.sessionType === 'REAL'
  return point.sessionType !== 'REAL'
}
