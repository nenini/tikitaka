import type { CSSProperties, HTMLAttributes } from 'react'
import { cn } from '../../shared/lib/cn'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: number | string
  height?: number | string
  /** 완전 원형 (아바타 로딩 등) */
  circle?: boolean
}

/** 로딩 스켈레톤 (`.bt-skeleton`). 항상 장식 — 로딩 사실은 부모가 aria-busy 로 알린다. */
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
