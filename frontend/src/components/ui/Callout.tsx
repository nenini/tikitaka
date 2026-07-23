import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger'

export interface CalloutProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CalloutTone
  /** 아이콘 교체 (기본은 tone 별 기본 아이콘). null 이면 숨김 */
  icon?: IconName | null
  children: ReactNode
}

const TONE_CLASS: Record<CalloutTone, string | false> = {
  info: false,
  success: 'bt-callout--success',
  warning: 'bt-callout--warning',
  danger: 'bt-callout--danger',
}

const TONE_ICON: Record<CalloutTone, IconName> = {
  info: 'info-circle',
  success: 'check',
  warning: 'warning',
  danger: 'warning',
}

/** 안내/고지 박스 (`.bt-callout`). 안전 고지·동의 안내 등. */
export function Callout({ tone = 'info', icon, className, children, ...rest }: CalloutProps) {
  const iconName = icon === null ? null : (icon ?? TONE_ICON[tone])
  return (
    <div className={cn('bt-callout', TONE_CLASS[tone], className)} {...rest}>
      {iconName && (
        <span className="bt-callout__icon">
          <Icon name={iconName} size={18} />
        </span>
      )}
      <div>{children}</div>
    </div>
  )
}
