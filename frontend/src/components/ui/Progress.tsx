import type { CSSProperties, HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0~100 */
  value: number
  'aria-label'?: string
}

/** 진행 바 (`.bt-progress`). */
export function Progress({ value, className, style, 'aria-label': ariaLabel, ...rest }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn('bt-progress', className)}
      style={{ ['--value' as string]: clamped, ...style } as CSSProperties}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      {...rest}
    >
      <div className="bt-progress__fill" />
    </div>
  )
}
