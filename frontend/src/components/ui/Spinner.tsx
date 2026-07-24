import type { CSSProperties } from 'react'
import { cn } from '../../shared/lib/cn'

export interface SpinnerProps {
  size?: number
  /** 선 색 (기본 currentColor) */
  color?: string
  /**
   * 로딩 상태의 접근 가능한 이름. `null` 이면 장식용(aria-hidden)으로 렌더된다 —
   * 이미 부모가 aria-busy/상태 텍스트로 알리고 있을 때 중복 안내를 막는다.
   */
  label?: string | null
  className?: string
}

/**
 * 인라인 로딩 스피너. `bt-spin` 회전 애니메이션을 사용.
 * 버튼 내부 로딩은 Button 의 loading prop 을 쓰고, 이건 독립 로딩 표시용.
 */
export function Spinner({ size = 20, color = 'currentColor', label = '불러오는 중', className }: SpinnerProps) {
  const decorative = label === null
  return (
    <span
      className={cn('bt-spinner', className)}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      style={
        {
          display: 'inline-block',
          flex: 'none',
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
