import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  /** 선택 상태 (토글 칩). 넘기면 aria-pressed 로 반영된다 */
  selected?: boolean
  onSelectedChange?: (next: boolean) => void
  children: ReactNode
}

/**
 * 선택 가능한 칩 (`.bt-chip`) — 얼굴상 태그·연습 목표 등.
 * selected/onSelectedChange 를 주면 토글로 동작한다.
 */
export function Chip({ selected, onSelectedChange, className, children, onClick, ...rest }: ChipProps) {
  const isToggle = selected !== undefined
  return (
    <button
      type="button"
      className={cn('bt-chip', className)}
      aria-pressed={isToggle ? selected : undefined}
      onClick={(e) => {
        onClick?.(e)
        if (isToggle) onSelectedChange?.(!selected)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

/** 정적 태그 칩 (`.bt-chip--tag --static`) — 클릭 불가. MBTI 등 표시용. */
export function TagChip({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('bt-chip', 'bt-chip--tag', 'bt-chip--static', className)} {...rest}>
      {children}
    </span>
  )
}
