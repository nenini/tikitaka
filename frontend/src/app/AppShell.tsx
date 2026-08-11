import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Avatar, BottomNav, IconButton } from '@/components'
import type { IconName } from '@/components'
import { faceTypeImage } from '@/features/face/faceImage'
import { useMyFaceAnalysis } from '@/features/face/useMyFaceAnalysis'
import { NotificationPanel } from '@/features/notifications/NotificationPanel'
import { useNotifications } from '@/features/notifications/useNotifications'
import { useAuthStore } from '@/stores/auth.store'

/* -------------------------------------------------------------------------- */
/*  AppShell — 앱 전체가 공유하는 셸(chrome).                                   */
/*  · 데스크탑: 상단 네비(로고 + 탭 + 알림 + 아바타)                             */
/*  · 모바일: 하단 네비(BottomNav) 고정                                         */
/*  홈/매칭/리포트/성장 등 top-level 화면이 <Outlet/> 으로 들어온다.            */
/*  (세션 등 몰입형 화면은 이 셸 밖에 둔다 — router 참고)                        */
/* -------------------------------------------------------------------------- */

type NavItem = { to: string; label: string; icon: IconName; end?: boolean }

/** 데스크탑 상단 탭. 마이페이지는 우측 아바타가 맡으므로 여기 넣지 않는다. */
const NAV: readonly NavItem[] = [
  { to: '/', label: '홈', icon: 'home', end: true },
  { to: '/matching', label: '매칭', icon: 'heart' },
  { to: '/reports', label: '리포트', icon: 'report' },
  { to: '/growth', label: '성장', icon: 'sparkle' },
]

/**
 * 모바일 하단 네비. 상단 헤더가 `md:block` 이라 **모바일에는 아바타 진입점이 아예 없다** —
 * 마이페이지로 갈 길이 없어서 여기에 항목을 더한다.
 *
 * 라벨을 '마이페이지'가 아니라 '마이'로 둔 이유: `.bt-nav__item` 이 `min-width: 56px` 이고
 * 나머지 라벨이 전부 2~3자라, 5자를 넣으면 이 칸만 넓어져 간격이 어긋난다.
 */
const MOBILE_NAV: readonly NavItem[] = [...NAV, { to: '/me', label: '마이', icon: 'user' }]

export function AppShell() {
  const [notiOpen, setNotiOpen] = useState(false)
  const noti = useNotifications()
  const user = useAuthStore((s) => s.user)
  // 얼굴상 진단을 마쳤으면 그 동물 이미지가 프로필 사진이 된다. 없으면 닉네임 이니셜.
  const faceImage = faceTypeImage(useMyFaceAnalysis()?.primaryType)
  return (
    <div className="tk-app-atmosphere flex min-h-dvh flex-col">
      {/* ── 데스크탑 상단 네비 (모바일 숨김) ───────────────────────── */}
      <header className="tk-glass-nav sticky top-0 z-30 hidden border-b border-[var(--bt-color-border)] md:block">
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
          {/* 벨과 마이페이지 진입 버튼을 같은 규격으로 맞춘다 — 둘 다 36px 원형·평면.
              기본 IconButton 은 44px 에 흰 배경 + 그림자라, 흰 헤더 위에서는 혼자 떠 보이고
              옆의 36px 아바타와 높이도 어긋났다. */}
          <div className="flex items-center gap-1.5">
            {/* 알림 벨 — 드롭다운 토글 + 안읽음 카운트 배지 (바깥클릭 미닫힘: onClose=벨 재클릭·X·Esc) */}
            <div className="relative">
              <IconButton
                icon="bell"
                small
                flat
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
                loading={noti.loading}
                streamDisconnected={noti.streamDisconnected}
              />
            </div>
            {/* 아바타를 round 로 둬 옆의 원형 벨과 형태를 맞춘다. 기본 sm 은 12px 라운드라
                포커스 링(rounded-full)과 실제 도형이 어긋났다. */}
            <NavLink
              to="/me"
              aria-label="내 정보"
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--bt-color-focus)]"
            >
              <Avatar size="sm" round name={user?.nickname ?? '내 정보'} src={faceImage} />
            </NavLink>
          </div>
        </div>
      </header>

      {/* ── 본문 (각 페이지가 자체 max-width/main 을 가진다) ────────── */}
      {/* pb: 모바일 하단 네비 높이만큼 여백 확보 */}
      <div className="tk-app-content flex-1">
        <Outlet />
      </div>

      {/* ── 모바일 하단 네비 (데스크탑 숨김) ───────────────────────── */}
      <div
        className="tk-glass-nav tk-mobile-nav fixed inset-x-0 bottom-0 z-30 md:hidden"
      >
        <BottomNav items={MOBILE_NAV.map(({ to, label, icon, end }) => ({ to, label, icon, end }))} />
      </div>
    </div>
  )
}
