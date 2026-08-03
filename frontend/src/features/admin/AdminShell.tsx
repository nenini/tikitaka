import { NavLink, Outlet } from 'react-router-dom'
import { Avatar, Badge } from '@/components'
import { useAuthStore } from '@/stores/auth.store'

/* -------------------------------------------------------------------------- */
/*  관리자 셸 (W-40/41/42 공통) — 소비자 AppShell 과 별개.                       */
/*   · 상단 ADMIN 바(로고 + ADMIN 뱃지 + 운영자)                                 */
/*   · 좌측 사이드바(운영/정책 그룹) — 데스크탑 / 모바일은 상단 가로 스크롤 네비   */
/*  ADMIN 롤 전용(AdminProtectedRoute 로 감싼다).                               */
/* -------------------------------------------------------------------------- */

const NAV: readonly { group: string; items: readonly { to: string; label: string; end?: boolean }[] }[] = [
  {
    group: '운영',
    items: [
      { to: '/admin', label: '대시보드', end: true },
      { to: '/admin/reports', label: '신고 관리' },
      { to: '/admin/members', label: '회원 관리' },
    ],
  },
  {
    group: '정책',
    items: [
      { to: '/admin/policy', label: '정책 설정' },
      { to: '/admin/presets', label: '사전 데이터' },
      { to: '/admin/analytics', label: '리포트' },
    ],
  },
]

const FLAT = NAV.flatMap((g) => g.items)

function linkClass(isActive: boolean) {
  return `block rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-[var(--bt-color-action-subtle)] font-bold text-link' : 'bt-muted hover:text-ink'
  }`
}

export function AdminShell() {
  const email = useAuthStore((s) => s.user?.email)

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* 상단 ADMIN 바 */}
      <header className="sticky top-0 z-30 border-b border-[var(--bt-color-border)] bg-surface">
        <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
          <span className="text-[17px] font-extrabold tracking-[-0.02em] text-brand">티키타카</span>
          <Badge tone="neutral">ADMIN</Badge>
          <div className="ml-auto flex items-center gap-3">
            <span className="bt-caption hidden sm:inline">운영자 · {email ?? 'admin'}</span>
            <Avatar size="sm" name={email ?? '운영자'} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* 모바일: 상단 가로 네비 */}
        <nav
          className="flex gap-1 overflow-x-auto border-b border-[var(--bt-color-border)] bg-surface px-3 py-2 md:hidden"
          aria-label="관리자 메뉴"
        >
          {FLAT.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `${linkClass(isActive)} whitespace-nowrap`}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* 데스크탑: 좌측 사이드바 */}
        <aside className="hidden w-[200px] shrink-0 border-r border-[var(--bt-color-border)] bg-surface p-3 md:block">
          <nav aria-label="관리자 메뉴">
            {NAV.map((g) => (
              <div key={g.group} className="mb-2">
                <div className="bt-caption px-3 pb-1 pt-2 font-bold uppercase tracking-wide">{g.group}</div>
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => linkClass(isActive)}>
                    {n.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* 본문 (각 페이지가 자체 패딩/폭을 가진다) */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
