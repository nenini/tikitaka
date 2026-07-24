import { NavLink } from 'react-router-dom'
import { BottomNavigation } from './BottomNavigation'
import type { BottomNavLinkRenderer, BottomNavigationProps } from './BottomNavigation'

/**
 * react-router 어댑터. **이 파일이 라우터에 종속된 유일한 지점**이고,
 * 실제 UI 는 라우터를 모르는 BottomNavigation 이 그린다.
 * (Storybook·React Native Web·다른 라우팅 라이브러리에서는 BottomNavigation 을 직접 쓴다.)
 *
 * NavLink 는 활성 링크의 앵커에 `aria-current="page"` 를 자동으로 붙인다 — CSS 가 이걸 타깃한다.
 */
export type BottomNavProps = Omit<BottomNavigationProps, 'renderLink'>

const renderNavLink: BottomNavLinkRenderer = ({ item, className, children, 'aria-label': ariaLabel }) => (
  <NavLink key={item.to} to={item.to} end={item.end} className={className} aria-label={ariaLabel}>
    {children}
  </NavLink>
)

export function BottomNav(props: BottomNavProps) {
  return <BottomNavigation {...(props as BottomNavigationProps)} renderLink={renderNavLink} />
}
