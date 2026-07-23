import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/* ── Stack ── 세로 배치. gap 은 디자인 시스템 스페이싱(px) 기준. */
export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: number
  as?: ElementType
}
export function Stack({ gap = 16, as: Tag = 'div', className, style, children, ...rest }: StackProps) {
  const Comp = Tag as ElementType
  return (
    <Comp className={cn('bt-stack', className)} style={{ gap, ...style } as CSSProperties} {...rest}>
      {children}
    </Comp>
  )
}

/* ── Cluster ── 가로 배치 + 줄바꿈. 태그/버튼 나열용. */
export interface ClusterProps extends HTMLAttributes<HTMLDivElement> {
  gap?: number
  as?: ElementType
}
export function Cluster({ gap = 8, as: Tag = 'div', className, style, children, ...rest }: ClusterProps) {
  const Comp = Tag as ElementType
  return (
    <Comp className={cn('bt-cluster', className)} style={{ gap, ...style } as CSSProperties} {...rest}>
      {children}
    </Comp>
  )
}

/* ── VisuallyHidden ── 스크린리더 전용 텍스트 (`.bt-sr-only`). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="bt-sr-only">{children}</span>
}
