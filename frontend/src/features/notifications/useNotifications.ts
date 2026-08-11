import { useCallback, useEffect, useRef, useState } from 'react'
import { parseServerDateTime } from '@/shared/api/datetime'
import { useAuthStore } from '@/stores/auth.store'
import { getNotifications, getUnreadCount, readAllNotifications, readNotification } from './api'
import { useNotificationStream } from './useNotificationStream'
import {
  formatRelativeTime,
  kindOf,
  routeOf,
  staysInBell,
  type AppNotification,
  type NotificationResponse,
} from './types'

/* -------------------------------------------------------------------------- */
/*  알림 데이터 훅 (NOTIFY-01)                                                 */
/*                                                                            */
/*  목록·미확인 수는 REST 로 읽고, 새 알림은 SSE 로 밀려온다.                   */
/*  둘이 같은 알림을 줄 수 있으므로 **notificationId 로 중복을 막는다.**        */
/* -------------------------------------------------------------------------- */

export type { AppNotification, NotificationKind } from './types'
export { KIND_ICON } from './types'

/** 서버 응답 → 화면 한 줄. */
function toAppNotification(raw: NotificationResponse): AppNotification {
  return {
    id: raw.notificationId,
    kind: kindOf(raw.type),
    title: raw.title,
    body: raw.content,
    time: formatRelativeTime(parseServerDateTime(raw.createdAt)),
    read: raw.read,
    to: routeOf(raw.referenceType, raw.referenceId),
  }
}

export interface UseNotifications {
  items: AppNotification[]
  unread: number
  markOne: (id: number) => void
  markAll: () => void
  loadMore: () => void
  hasMore: boolean
  /** 최초 로딩 중. 패널이 '알림 없음'과 구분해 그린다. */
  loading: boolean
  /** 실시간 연결이 끊겼는가. 조용히 죽지 않도록 화면이 알려준다. */
  streamDisconnected: boolean
}

export function useNotifications(): UseNotifications {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  /** 중복 방지용 id 집합. SSE 와 REST 가 같은 알림을 줄 수 있다. */
  const seenIds = useRef<Set<number>>(new Set())

  /** 첫 페이지를 다시 읽는다. 재접속 직후에도 부른다(끊긴 동안의 구멍 메우기). */
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [page, count] = await Promise.all([getNotifications(), getUnreadCount()])
      const visible = page.notifications.filter((n) => staysInBell(n.presentation))
      seenIds.current = new Set(visible.map((n) => n.notificationId))
      setItems(visible.map(toAppNotification))
      setCursor(page.nextCursor)
      setHasMore(page.hasNext)
      setUnread(count)
    } catch {
      // 알림은 부가 기능이다. 실패해도 화면 전체를 오류로 덮지 않는다.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      seenIds.current = new Set()
      setItems([])
      setUnread(0)
      setCursor(null)
      setHasMore(false)
      return
    }
    void reload()
  }, [isAuthenticated, reload])

  /** SSE 로 들어온 새 알림. 이미 있는 id 면 무시한다. */
  const handleIncoming = useCallback((raw: NotificationResponse) => {
    if (!staysInBell(raw.presentation)) return
    if (seenIds.current.has(raw.notificationId)) return
    seenIds.current.add(raw.notificationId)
    setItems((prev) => [toAppNotification(raw), ...prev])
    if (!raw.read) setUnread((n) => n + 1)
  }, [])

  const { state: streamState } = useNotificationStream({
    onNotification: handleIncoming,
    onReconnected: () => void reload(),
    enabled: isAuthenticated,
  })

  const markOne = useCallback((id: number) => {
    // 낙관적 반영 — 누른 즉시 읽음으로 보이는 편이 자연스럽다.
    let wasUnread = false
    setItems((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n
        wasUnread = !n.read
        return { ...n, read: true }
      }),
    )
    if (wasUnread) setUnread((n) => Math.max(0, n - 1))

    void readNotification(id).catch(() => {
      // 실패하면 되돌린다. 읽음 표시가 남으면 사용자는 처리된 줄 안다.
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)))
      if (wasUnread) setUnread((n) => n + 1)
    })
  }, [])

  const markAll = useCallback(() => {
    const snapshot = items
    const previousUnread = unread
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)

    void readAllNotifications().catch(() => {
      setItems(snapshot)
      setUnread(previousUnread)
    })
  }, [items, unread])

  const loadMore = useCallback(() => {
    if (!hasMore || cursor == null || loading) return
    setLoading(true)
    void getNotifications(cursor)
      .then((page) => {
        const fresh = page.notifications.filter(
          (n) => staysInBell(n.presentation) && !seenIds.current.has(n.notificationId),
        )
        fresh.forEach((n) => seenIds.current.add(n.notificationId))
        setItems((prev) => [...prev, ...fresh.map(toAppNotification)])
        setCursor(page.nextCursor)
        setHasMore(page.hasNext)
      })
      .catch(() => {
        /* 더보기 실패는 조용히 넘긴다 — 보고 있던 목록은 그대로다 */
      })
      .finally(() => setLoading(false))
  }, [cursor, hasMore, loading])

  return {
    items,
    unread,
    markOne,
    markAll,
    loadMore,
    hasMore,
    loading,
    streamDisconnected: isAuthenticated && streamState === 'closed',
  }
}
