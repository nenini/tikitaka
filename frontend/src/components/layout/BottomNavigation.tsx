import type { ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

/* 하단 내비게이션 — **순수 렌더링**. 특정 라우터에 종속되지 않는다.
   react-router 연결은 BottomNav(어댑터)가 renderLink 로 주입한다. */

export interface BottomNavItemDef {
  icon: IconName
  label: string
  /** 이동 경로. renderLink 에 그대로 전달된다 */
  to: string
  /** 정확히 일치할 때만 활성 (홈 등) */
  end?: boolean
}

/** to 와 onClick 은 동시에 쓸 수 없다 — 실제 구현에서 to 가 우선되고 onClick 이 조용히 무시되는 함정을 타입으로 막는다. */
export type BottomNavFab =
  | { label: string; icon?: IconName; to: string; onClick?: never }
  | { label: string; icon?: IconName; onClick: () => void; to?: never }

export interface BottomNavLinkRenderProps {
  item: BottomNavItemDef
  className: string
  children: ReactNode
  /** 아이콘만 있는 FAB 링크처럼 라벨이 보이지 않을 때 채워진다 */
  'aria-label'?: string
}

/** 링크 렌더 위임. 미지정 시 평범한 `<a href>` 로 렌더된다. */
export type BottomNavLinkRenderer = (props: BottomNavLinkRenderProps) => ReactNode

interface BottomNavigationCommonProps {
  fab?: BottomNavFab
  renderLink?: BottomNavLinkRenderer
  className?: string
}

/**
 * FAB 이 있으면 좌우 항목을 **명시적으로** 나눈다.
 * `items` 를 중간에서 자르면 홀수일 때 3:2 처럼 좌우가 어긋나 FAB 이 시각적 중앙에서 밀린다.
 */
export type BottomNavigationProps = BottomNavigationCommonProps &
  (
    | { items: readonly BottomNavItemDef[]; leftItems?: never; rightItems?: never; fab?: never }
    | {
        items?: never
        leftItems: readonly BottomNavItemDef[]
        rightItems: readonly BottomNavItemDef[]
        fab: BottomNavFab
      }
  )

const defaultRenderLink: BottomNavLinkRenderer = ({ item, className, children, 'aria-label': ariaLabel }) => (
  <a key={item.to} href={item.to} className={className} aria-label={ariaLabel}>
    {children}
  </a>
)

/**
 * 하단 글래스 내비게이션 + FAB (`.bt-nav`).
 * FAB 은 CSS Grid 로 바의 정확한 중앙에 고정되므로 좌우 항목 수가 달라도 중심이 흔들리지 않는다.
 * 하단 고정은 페이지 레이아웃(Screen)에서 처리하고, 여기서는 바 자체만 그린다.
 */
export function BottomNavigation({
  items,
  leftItems,
  rightItems,
  fab,
  renderLink = defaultRenderLink,
  className,
}: BottomNavigationProps) {
  const left = leftItems ?? items ?? []
  const right = rightItems ?? []

  const renderItem = (item: BottomNavItemDef) => (
    <span key={item.to} className="bt-nav__slot">
      {renderLink({
        item,
        className: 'bt-nav__item',
        children: (
          <>
            <Icon name={item.icon} size={21} />
            {item.label}
          </>
        ),
      })}
    </span>
  )

  return (
    <nav className={cn('bt-nav', fab && 'bt-nav--with-fab', className)} aria-label="주요 메뉴">
      <div className="bt-nav__group">{left.map(renderItem)}</div>
      {fab && <Fab fab={fab} renderLink={renderLink} />}
      {fab && <div className="bt-nav__group">{right.map(renderItem)}</div>}
    </nav>
  )
}

function Fab({ fab, renderLink }: { fab: BottomNavFab; renderLink: BottomNavLinkRenderer }) {
  const content = <Icon name={fab.icon ?? 'bloom'} size={24} />

  if (fab.to != null) {
    return (
      <span className="bt-nav__fab-slot">
        {renderLink({
          item: { icon: fab.icon ?? 'bloom', label: fab.label, to: fab.to },
          className: 'bt-nav__fab',
          children: content,
          'aria-label': fab.label,
        })}
      </span>
    )
  }

  return (
    <span className="bt-nav__fab-slot">
      <button type="button" className="bt-nav__fab" aria-label={fab.label} onClick={fab.onClick}>
        {content}
      </button>
    </span>
  )
}
