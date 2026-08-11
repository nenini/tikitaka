import { apiClient } from '@/shared/api/client'
import { unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type {
  NotificationListResponse,
  NotificationResponse,
  ReadAllNotificationsResponse,
  UnreadNotificationCountResponse,
} from './types'

/**
 * 알림 REST 배선. (NOTIFY-01)
 *
 * 성공 응답은 `{ success, data }` 래퍼 → `unwrap()` (규칙 SSOT: `@/shared/api/envelope`).
 */
const BASE = '/v1/notifications'

/** 기본 페이지 크기. 서버 기본값과 같다. */
export const NOTIFICATION_PAGE_SIZE = 20

/**
 * 목록. `cursor` 를 주면 그 이후를 이어서 준다.
 * 다음 페이지 여부는 `hasNext` 와 `nextCursor` 로 판단한다.
 */
export async function getNotifications(
  cursor?: number | null,
  size: number = NOTIFICATION_PAGE_SIZE,
): Promise<NotificationListResponse> {
  return unwrap(
    await apiClient.get<ApiEnvelope<NotificationListResponse>>(BASE, {
      // cursor 가 없으면 파라미터 자체를 빼야 첫 페이지가 온다
      params: cursor == null ? { size } : { cursor, size },
    }),
  )
}

/** 미확인 개수. 벨 배지의 SSOT. */
export async function getUnreadCount(): Promise<number> {
  const data = unwrap(
    await apiClient.get<ApiEnvelope<UnreadNotificationCountResponse>>(`${BASE}/unread-count`),
  )
  return data.unreadCount
}

/** 개별 읽음. */
export async function readNotification(notificationId: number): Promise<NotificationResponse> {
  return unwrap(
    await apiClient.patch<ApiEnvelope<NotificationResponse>>(`${BASE}/${notificationId}/read`),
  )
}

/** 전체 읽음. 응답의 `readCount` 는 실제로 바뀐 건수다. */
export async function readAllNotifications(): Promise<ReadAllNotificationsResponse> {
  return unwrap(
    await apiClient.patch<ApiEnvelope<ReadAllNotificationsResponse>>(`${BASE}/read-all`),
  )
}

/**
 * SSE 구독 URL.
 *
 * ⚠️ `apiClient` 를 쓰지 않는다 — axios 는 스트림을 흘려주지 못한다.
 *    `useNotificationStream` 이 fetch 로 직접 연다. baseURL 규칙은 동일하게 맞춘다.
 */
export function notificationStreamUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  return `${base}${BASE}/subscribe`
}
