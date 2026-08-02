import { useState } from 'react'

/* -------------------------------------------------------------------------- */
/*  알림 데이터 훅 (데모 고정).                                                 */
/*  TODO(NOTI): 백엔드 #21 연동                                                 */
/*   - GET  /api/v1/notifications           목록                               */
/*   - GET  /api/v1/notifications/unread    미확인 개수                         */
/*   - PATCH /api/v1/notifications/{id}/read · /read-all   읽음                 */
/*   - SSE  /api/v1/notifications/stream     실시간(EventSource)               */
/* -------------------------------------------------------------------------- */

export type NotificationKind = 'match' | 'reminder' | 'report' | 'cancel' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  time: string
  read: boolean
  /** 클릭 시 이동 경로(있으면) */
  to?: string
}

/** 유형별 아이콘(디자인: 이모지 마크). */
export const KIND_ICON: Record<NotificationKind, string> = {
  match: '💘',
  reminder: '⏰',
  report: '📊',
  cancel: '🙅',
  system: '🔔',
}

const RECENT: AppNotification[] = [
  { id: 'n1', kind: 'match', title: '매칭이 성립했어요', body: '유월님과 매칭 · 5분 안에 수락', time: '방금', read: false, to: '/matching' },
  { id: 'n2', kind: 'reminder', title: '세션 1시간 전이에요', body: '오늘 19:00 · 지금 취소 시 패널티', time: '10분', read: false, to: '/' },
  { id: 'n3', kind: 'report', title: '리포트가 준비됐어요', body: '6회차 세션 리포트', time: '2일', read: true, to: '/reports' },
  { id: 'n4', kind: 'cancel', title: '상대가 세션을 취소했어요', body: '내 온도·패널티 영향 없음', time: '3일', read: true },
]

/** '지난 알림 더보기' 로 인라인 확장될 과거 알림. TODO(NOTI): 페이지네이션 커서로 대체. */
const OLDER: AppNotification[] = [
  { id: 'n5', kind: 'report', title: '리포트가 준비됐어요', body: '5회차 세션 리포트', time: '6일', read: true, to: '/reports' },
  { id: 'n6', kind: 'system', title: '동의 항목이 업데이트됐어요', body: '개인정보 처리방침 개정 안내', time: '1주', read: true, to: '/me/consent' },
  { id: 'n7', kind: 'match', title: '매칭이 성립했어요', body: '서준님과 매칭', time: '2주', read: true, to: '/matching' },
]

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>(RECENT)
  const [expanded, setExpanded] = useState(false)

  const unread = items.filter((n) => !n.read).length

  const markOne = (id: string) => setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n)))
  const markAll = () => setItems((xs) => xs.map((n) => ({ ...n, read: true })))
  const loadMore = () => {
    setItems((xs) => [...xs, ...OLDER])
    setExpanded(true)
  }

  return { items, unread, markOne, markAll, loadMore, hasMore: !expanded }
}
