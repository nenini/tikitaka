import type { CSSProperties } from 'react'
import { cn } from '@/shared/lib/cn'

export interface SpinnerProps {
  size?: number
  /** 선 색 (기본 currentColor) */
  color?: string
  className?: string
  label?: string
}

/**
 * 인라인 로딩 스피너. `.bt-btn.is-loading` 과 동일한 회전 애니메이션(bt-spin)을 사용.
 * 버튼 내부 로딩은 Button 의 loading prop 을 쓰고, 이건 독립 로딩 표시용.
 */
export function Spinner({ size = 20, color = 'currentColor', className, label = '불러오는 중' }: SpinnerProps) {
  return (
    <span
      className={cn('bt-spinner', className)}
      role="status"
      aria-label={label}
      style={
        {
          display: 'inline-block',
          width: size,
          height: size,
          border: `2px solid color-mix(in srgb, ${color} 30%, transparent)`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'bt-spin 700ms linear infinite',
        } as CSSProperties
      }
    />
  )
}
