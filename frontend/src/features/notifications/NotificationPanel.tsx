import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, EmptyState, Icon } from '@/components'
import { KIND_ICON } from './useNotifications'
import type { AppNotification } from './useNotifications'

interface NotificationPanelProps {
  open: boolean
  onClose: () => void
  items: AppNotification[]
  unread: number
  markOne: (id: string) => void
  markAll: () => void
  loadMore: () => void
  hasMore: boolean
}

/* -------------------------------------------------------------------------- */
/*  알림 벨 드롭다운 패널 (AppShell 헤더 벨에 부착)                             */
/*  1차 확정 옵션:                                                            */
/*   ① 벨 아래 드롭다운   ② 스크림 없음 + 바깥 클릭으로 닫히지 않음             */
/*     (닫기: 벨 재클릭 · X 버튼 · Esc)                                        */
/*   ③ '지난 알림 더보기' 인라인 확장   ④ 개별 + 전체(모두 읽음)               */
/* -------------------------------------------------------------------------- */

export function NotificationPanel({ open, onClose, items, unread, markOne, markAll, loadMore, hasMore }: NotificationPanelProps) {
  const navigate = useNavigate()

  // ② 바깥 클릭으로는 닫지 않음 — 대신 Esc 로 닫는 안전장치는 둔다
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const openItem = (id: string, to?: string) => {
    markOne(id)
    if (to) {
      navigate(to)
      onClose()
    }
  }

  return (
    <div
      role="dialog"
      aria-label="알림"
      className="absolute right-0 top-full z-40 mt-2 w-[372px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[var(--bt-color-border)] bg-surface shadow-[0_20px_60px_-20px_rgba(20,12,18,.35)]"
    >
      <header className="flex items-center justify-between border-b border-[var(--bt-color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <b className="text-sm">알림</b>
          {unread > 0 && <Badge tone="danger">{unread}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="bt-caption font-semibold text-link" onClick={markAll}>
            모두 읽음
          </button>
          <button type="button" aria-label="닫기" className="bt-muted hover:text-ink" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState icon={<Icon name="bell" size={28} />} title="새 알림이 없어요" />
      ) : (
        <ul className="max-h-[320px] overflow-auto">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openItem(n.id, n.to)}
                className={`group flex w-full items-start gap-3 border-b border-[var(--bt-color-border)] px-4 py-3 text-left transition-colors hover:bg-surface-sunken ${
                  n.read ? '' : 'bg-[color:var(--bt-color-action-subtle)]'
                }`}
              >
                <span aria-hidden="true" className="mt-0.5 text-[17px]">
                  {KIND_ICON[n.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {!n.read && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                    <span className="bt-body-sm truncate font-semibold">{n.title}</span>
                  </span>
                  <span className="bt-caption mt-0.5 block">{n.body}</span>
                </span>
                <span className="bt-caption shrink-0">{n.time}</span>
                {!n.read && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      markOne(n.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        markOne(n.id)
                      }
                    }}
                    className="bt-caption shrink-0 self-center font-semibold text-link opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    읽음
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ③ 지난 알림 더보기 — 인라인 확장 */}
      {hasMore && items.length > 0 && (
        <button
          type="button"
          onClick={loadMore}
          className="bt-caption block w-full border-t border-[var(--bt-color-border)] py-3 text-center hover:bg-surface-sunken"
        >
          지난 알림 더보기
        </button>
      )}
    </div>
  )
}
