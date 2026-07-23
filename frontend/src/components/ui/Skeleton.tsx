import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: number | string
  height?: number | string
  /** 완전 원형 (아바타 로딩 등) */
  circle?: boolean
}

/** 로딩 스켈레톤 (`.bt-skeleton`). */
export function Skeleton({ width, height = 16, circle = false, className, style, ...rest }: SkeletonProps) {
  return (
    <div
      className={cn('bt-skeleton', className)}
      aria-hidden="true"
      style={{ width, height, borderRadius: circle ? '50%' : undefined, ...style } as CSSProperties}
      {...rest}
    />
  )
}

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  text?: ReactNode
  action?: ReactNode
  className?: string
}

/** 빈 상태 (`.bt-empty`). */
export function EmptyState({ icon, title, text, action, className }: EmptyStateProps) {
  return (
    <div className={cn('bt-empty', className)}>
      {icon}
      <span className="bt-empty__title">{title}</span>
      {text != null && <span className="bt-empty__text">{text}</span>}
      {action}
    </div>
  )
}
