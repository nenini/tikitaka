/**
 * 알림(NOTIFY-01) 도메인 타입.
 * 백엔드 SSOT: `NotificationController` + `notification/dto/response/*`.
 *
 *   GET   /api/v1/notifications?cursor=&size=   커서 기반 목록
 *   GET   /api/v1/notifications/unread-count    미확인 개수
 *   PATCH /api/v1/notifications/{id}/read       개별 읽음
 *   PATCH /api/v1/notifications/read-all        전체 읽음
 *   GET   /api/v1/notifications/subscribe       SSE (text/event-stream)
 */

/**
 * 서버 `NotificationType`.
 *
 * ⚠️ 서버가 종류를 늘려도 화면이 깨지면 안 되므로, 유니온에 `(string & {})` 를 섞어
 *    **모르는 값도 타입으로 받아들인다.** 대신 아이콘·경로 매핑이 기본값으로 떨어진다.
 */
export type NotificationType =
  | 'MATCH_FOUND'
  | 'MATCH_ACCEPTANCE_DEADLINE_SOON'
  | 'MATCH_ACCEPTANCE_EXPIRED'
  | 'MATCH_CONFIRMED'
  | 'MATCH_REJECTED'
  | 'MATCH_CANCELLED'
  | 'SESSION_REMINDER_2H'
  | 'SESSION_REMINDER_1H'
  | 'SESSION_REMINDER_10M'
  | 'MATCH_SETTING_RECOMMENDED'
  | (string & {})

/** 서버 `NotificationReferenceType`. 이동 경로를 만드는 근거다. */
export type NotificationReferenceType = 'MATCH_REQUEST' | 'MATCH_PAIR' | 'SESSION' | (string & {})

/**
 * 서버 `NotificationPresentation`.
 * `TOAST_ONLY` 는 벨 목록에 남기지 않는 휘발성 알림이다.
 */
export type NotificationPresentation = 'BELL' | 'BELL_AND_TOAST' | 'TOAST_ONLY' | (string & {})

/** `NotificationResponse`. 날짜는 서버 `LocalDateTime`(타임존 없음). */
export interface NotificationResponse {
  notificationId: number
  type: NotificationType
  title: string
  content: string
  referenceType: NotificationReferenceType | null
  referenceId: number | null
  presentation: NotificationPresentation
  read: boolean
  createdAt: string
  readAt: string | null
}

/** `NotificationListResponse` — 커서 기반. */
export interface NotificationListResponse {
  notifications: NotificationResponse[]
  /** 다음 페이지 커서. 없으면 null. */
  nextCursor: number | null
  hasNext: boolean
}

/** `UnreadNotificationCountResponse`. */
export interface UnreadNotificationCountResponse {
  unreadCount: number
}

/** `ReadAllNotificationsResponse`. 실제 응답으로 확인한 필드명이다(2026-08-04). */
export interface ReadAllNotificationsResponse {
  /** 이번 호출로 읽음 처리된 건수. 이미 다 읽었으면 0. */
  updatedCount: number
  readAt: string
}

/* ── 화면 어휘 ─────────────────────────────────────────── */

/** 벨 목록의 아이콘 분류. 서버 타입(10종)을 이 5종으로 접는다. */
export type NotificationKind = 'match' | 'reminder' | 'report' | 'cancel' | 'system'

/** 유형별 아이콘(디자인: 이모지 마크). */
export const KIND_ICON: Readonly<Record<NotificationKind, string>> = {
  match: '💘',
  reminder: '⏰',
  report: '📊',
  cancel: '🙅',
  system: '🔔',
}

/**
 * 서버 타입 → 화면 분류.
 *
 * 모르는 타입은 `system` 으로 떨어뜨린다 — 서버가 종류를 늘렸을 때 화면이 빈 아이콘으로
 * 깨지는 대신 기본 벨로 뜬다.
 */
const KIND_BY_TYPE: Readonly<Record<string, NotificationKind>> = {
  MATCH_FOUND: 'match',
  MATCH_CONFIRMED: 'match',
  MATCH_ACCEPTANCE_DEADLINE_SOON: 'match',
  MATCH_ACCEPTANCE_EXPIRED: 'cancel',
  MATCH_REJECTED: 'cancel',
  MATCH_CANCELLED: 'cancel',
  SESSION_REMINDER_2H: 'reminder',
  SESSION_REMINDER_1H: 'reminder',
  SESSION_REMINDER_10M: 'reminder',
  MATCH_SETTING_RECOMMENDED: 'system',
}

export function kindOf(type: NotificationType): NotificationKind {
  return KIND_BY_TYPE[type] ?? 'system'
}

/**
 * 참조 → 이동 경로.
 *
 * 매핑할 수 없으면 **undefined 를 돌려준다.** 추측해서 아무 데나 보내면 사용자는
 * 알림을 눌렀다가 엉뚱한 화면을 보게 되고, 그게 알림 자체를 못 믿게 만든다.
 */
export function routeOf(
  referenceType: NotificationReferenceType | null,
  referenceId: number | null,
): string | undefined {
  if (referenceId == null) return undefined
  switch (referenceType) {
    case 'MATCH_REQUEST':
      return `/matching/queue/${referenceId}`
    case 'MATCH_PAIR':
      return `/matching/pair/${referenceId}`
    case 'SESSION':
      // 세션 알림은 리마인더가 대부분이라 대기방으로 보낸다(세션 화면은 시작 후에만 유효).
      return `/session/${referenceId}/room`
    default:
      return undefined
  }
}

/** 벨 목록에 남는 알림인지. `TOAST_ONLY` 는 휘발성이다. */
export function staysInBell(presentation: NotificationPresentation): boolean {
  return presentation !== 'TOAST_ONLY'
}

/* ── 화면 모델 ─────────────────────────────────────────── */

/** 패널이 그리는 한 줄. 서버 응답을 화면 어휘로 접은 것이다. */
export interface AppNotification {
  id: number
  kind: NotificationKind
  title: string
  body: string
  /** 사람이 읽는 상대 시각('방금' · '10분' · '2일'). */
  time: string
  read: boolean
  /** 클릭 시 이동 경로. 매핑할 수 없으면 없다. */
  to?: string
}

/**
 * 상대 시각 표기. 패널이 좁아 '3분 전' 대신 '3분'까지만 쓴다(기존 디자인 유지).
 *
 * 서버 `LocalDateTime` 은 타임존이 없어 그대로 `new Date()` 하면 기기 타임존으로
 * 해석된다 — 반드시 `parseServerDateTime` 을 거쳐야 한다.
 */
export function formatRelativeTime(date: Date | null, now: number = Date.now()): string {
  if (!date) return ''
  const diffSec = Math.max(0, Math.floor((now - date.getTime()) / 1000))
  if (diffSec < 60) return '방금'
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}분`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day}일`
  const week = Math.floor(day / 7)
  if (week < 5) return `${week}주`
  return `${Math.floor(day / 30)}개월`
}
