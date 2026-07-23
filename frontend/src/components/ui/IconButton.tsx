import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/shared/lib/cn'
import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'

export type IconButtonState = 'default' | 'on' | 'off' | 'end' | 'like'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 아이콘 이름 (icon 노드를 직접 넣으려면 children 사용) */
  icon?: IconName
  /** 통화 컨트롤 상태색. off=중립회색(되돌림 가능), end=빨강(종료) */
  state?: IconButtonState
  /** 56px 대형 (세션 통화 컨트롤 권장) */
  large?: boolean
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
  className,
  children,
  ref,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('bt-icon-btn', STATE_CLASS[state], large && 'bt-icon-btn--lg', className)}
      {...rest}
    >
      {children ?? (icon && <Icon name={icon} size={large ? 22 : 19} />)}
    </button>
  )
}

/** 통화 컨트롤을 감싸는 글래스 바 (`.bt-call-bar`). */
export function CallBar({ className, children, ...rest }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('bt-call-bar', className)} {...rest}>
      {children}
    </div>
  )
}
