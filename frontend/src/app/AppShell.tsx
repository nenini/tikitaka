import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Avatar, BottomNav, IconButton } from '@/components'
import type { IconName } from '@/components'
import { NotificationPanel } from '@/features/notifications/NotificationPanel'
import { useNotifications } from '@/features/notifications/useNotifications'

/* -------------------------------------------------------------------------- */
/*  AppShell — 앱 전체가 공유하는 셸(chrome).                                   */
/*  · 데스크탑: 상단 네비(로고 + 탭 + 알림 + 아바타)                             */
/*  · 모바일: 하단 네비(BottomNav) 고정                                         */
/*  홈/매칭/리포트/성장 등 top-level 화면이 <Outlet/> 으로 들어온다.            */
/*  (세션 등 몰입형 화면은 이 셸 밖에 둔다 — router 참고)                        */
/* -------------------------------------------------------------------------- */

const NAV: readonly { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: '홈', icon: 'home', end: true },
  { to: '/matching', label: '매칭', icon: 'heart' },
  { to: '/reports', label: '리포트', icon: 'report' },
  { to: '/growth', label: '성장', icon: 'sparkle' },
]

export function AppShell() {
  const [notiOpen, setNotiOpen] = useState(false)
  const noti = useNotifications()
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* ── 데스크탑 상단 네비 (모바일 숨김) ───────────────────────── */}
      <header className="sticky top-0 z-30 hidden border-b border-[var(--bt-color-border)] bg-surface md:block">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            {/* TODO(브랜드): 로고 마크 확정 시 워드마크 옆에 추가 */}
            <NavLink to="/" className="text-[18px] font-extrabold tracking-[-0.02em] text-brand">
              티키타카
            </NavLink>
            <nav className="flex gap-1" aria-label="주요 메뉴">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      isActive ? 'font-bold text-ink' : 'bt-muted hover:text-ink'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {/* 알림 벨 — 드롭다운 토글 + 안읽음 카운트 배지 (바깥클릭 미닫힘: onClose=벨 재클릭·X·Esc) */}
            <div className="relative">
              <IconButton
                icon="bell"
                aria-label={noti.unread > 0 ? `알림 (안읽음 ${noti.unread}개)` : '알림'}
                aria-expanded={notiOpen}
                onClick={() => setNotiOpen((v) => !v)}
              />
              {noti.unread > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white"
                  style={{ background: 'var(--bt-color-danger-fill, #d0455f)' }}
                >
                  {noti.unread}
                </span>
              )}
              <NotificationPanel
                open={notiOpen}
                onClose={() => setNotiOpen(false)}
                items={noti.items}
                unread={noti.unread}
                markOne={noti.markOne}
                markAll={noti.markAll}
                loadMore={noti.loadMore}
                hasMore={noti.hasMore}
              />
            </div>
            <NavLink to="/me" aria-label="내 정보" className="rounded-full">
              <Avatar size="sm" name="유월" />
            </NavLink>
          </div>
        </div>
      </header>

      {/* ── 본문 (각 페이지가 자체 max-width/main 을 가진다) ────────── */}
      {/* pb: 모바일 하단 네비 높이만큼 여백 확보 */}
      <div className="flex-1 pb-[76px] md:pb-0">
        <Outlet />
      </div>

      {/* ── 모바일 하단 네비 (데스크탑 숨김) ───────────────────────── */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--bt-color-border)] bg-surface md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <BottomNav items={NAV.map(({ to, label, icon, end }) => ({ to, label, icon, end }))} />
      </div>
    </div>
  )
}
