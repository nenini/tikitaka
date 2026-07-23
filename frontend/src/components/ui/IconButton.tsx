import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { Spinner } from './Spinner'

export type IconButtonState = 'default' | 'on' | 'off' | 'end' | 'like'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 아이콘 이름 (icon 노드를 직접 넣으려면 children 사용) */
  icon?: IconName
  /** 통화 컨트롤 상태색. off=중립회색(되돌림 가능), end=빨강(종료) */
  state?: IconButtonState
  /** 56px 대형 (세션 통화 컨트롤 권장) */
  large?: boolean
  /** 처리 중(장치 전환 등) — 스피너 표시 + 클릭 차단 */
  loading?: boolean
  /** 접근성상 필수 — 아이콘만 있는 버튼은 항상 라벨을 준다 */
  'aria-label': string
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

const STATE_CLASS: Record<IconButtonState, string | false> = {
  default: false,
  on: 'bt-icon-btn--on',
  off: 'bt-icon-btn--off',
  end: 'bt-icon-btn--end',
  like: 'bt-icon-btn--like',
}

/**
 * 아이콘 전용 버튼 (`.bt-icon-btn`). 세션 통화 컨트롤·좋아요 등.
 * 반드시 aria-label 을 준다.
 */
export function IconButton({
  icon,
  state = 'default',
  large = false,
  loading = false,
  disabled,
  className,
  children,
  ref,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const iconSize = large ? 22 : 19
  return (
    <button
      ref={ref}
      type={type}
      className={cn('bt-icon-btn', STATE_CLASS[state], large && 'bt-icon-btn--lg', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} label={null} /> : (children ?? (icon && <Icon name={icon} size={iconSize} />))}
    </button>
  )
}

export interface CallBarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** 통화 컨트롤을 감싸는 글래스 바 (`.bt-call-bar`). */
export function CallBar({ className, children, ...rest }: CallBarProps) {
  return (
    <div className={cn('bt-call-bar', className)} {...rest}>
      {children}
    </div>
  )
}
