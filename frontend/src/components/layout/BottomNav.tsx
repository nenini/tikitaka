import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/shared/lib/cn'
import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'

export interface BottomNavItemDef {
  icon: IconName
  label: string
  to: string
  /** 정확히 일치할 때만 활성 (홈 등) */
  end?: boolean
}

export interface BottomNavProps {
  items: BottomNavItemDef[]
  /** 가운데 FAB (연습 시작 등). 있으면 items 사이 중앙에 배치 */
  fab?: {
    label: string
    onClick?: () => void
    to?: string
    icon?: IconName
  }
  className?: string
}

/**
 * 하단 글래스 내비게이션 + FAB (`.bt-nav`).
 * 라우팅은 react-router NavLink 로 처리되어 현재 경로가 자동으로 aria-current="page" 가 된다.
 * app/web 공용: 하단 고정은 페이지 레이아웃(Screen)에서 처리하고, 여기서는 바 자체만 그린다.
 */
export function BottomNav({ items, fab, className }: BottomNavProps) {
  const half = Math.ceil(items.length / 2)
  const left = fab ? items.slice(0, half) : items
  const right = fab ? items.slice(half) : []

  // NavLink 는 활성 시 앵커에 aria-current="page" 를 자동으로 붙인다 (CSS 가 이걸 타깃).
  const renderItem = (it: BottomNavItemDef) => (
    <NavLink key={it.to} to={it.to} end={it.end} className="bt-nav__item">
      <Icon name={it.icon} size={21} />
      {it.label}
    </NavLink>
  )

  return (
    <nav className={cn('bt-nav', className)} aria-label="주요 메뉴">
      {left.map(renderItem)}
      {fab && <Fab {...fab} />}
      {right.map(renderItem)}
    </nav>
  )
}

function Fab({ label, onClick, to, icon = 'bloom' }: NonNullable<BottomNavProps['fab']>) {
  const content: ReactNode = <Icon name={icon} size={24} />
  if (to) {
    return (
      <NavLink to={to} className="bt-nav__fab" aria-label={label}>
        {content}
      </NavLink>
    )
  }
  return (
    <button type="button" className="bt-nav__fab" aria-label={label} onClick={onClick}>
      {content}
    </button>
  )
}
