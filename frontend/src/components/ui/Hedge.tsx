import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export interface HedgeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode
}

/**
 * AI 추정 정보에 붙이는 헤지 배지 (`.bt-hedge`).
 * 디자인 원칙 3(단정하지 않는다)의 집행 장치 — 표정/감정/반응 추정 UI에는 이 배지가 **필수**다.
 * 기본 문구는 "ⓘ AI 추정 · 참고용".
 */
export function Hedge({ className, children, ...rest }: HedgeProps) {
  return (
    <span className={cn('bt-hedge', className)} {...rest}>
      {children ?? <>&#9432; AI 추정 · 참고용</>}
    </span>
  )
}
