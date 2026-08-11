import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  children: ReactNode
}

const TONE_CLASS: Record<BadgeTone, string | false> = {
  neutral: false,
  info: 'bt-badge--info',
  success: 'bt-badge--success',
  warning: 'bt-badge--warning',
  danger: 'bt-badge--danger',
}

/** 상태 라벨 배지 (`.bt-badge`). */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn('bt-badge', TONE_CLASS[tone], className)} {...rest}>
      {children}
    </span>
  )
}
