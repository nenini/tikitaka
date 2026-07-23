import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type CardVariant = 'default' | 'glass' | 'inset' | 'flat'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  /** hover 시 살짝 떠오르는 상호작용 카드 */
  interactive?: boolean
}

const VARIANT_CLASS: Record<CardVariant, string | false> = {
  default: false,
  glass: 'bt-card--glass',
  inset: 'bt-card--inset',
  flat: 'bt-card--flat',
}

/** 카드 컨테이너 (`.bt-card`). */
export function Card({ variant = 'default', interactive = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('bt-card', VARIANT_CLASS[variant], interactive && 'bt-card--interactive', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

/** 카드 헤더 — 좌측 타이틀, 우측 액션. (`.bt-card__head`) */
export function CardHeader({
  title,
  action,
  className,
  children,
}: {
  title?: ReactNode
  action?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('bt-card__head', className)}>
      {title != null ? <span className="bt-card__title">{title}</span> : children}
      {action}
    </div>
  )
}
