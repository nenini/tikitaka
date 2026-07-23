import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'

export interface TopicButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

/**
 * 침묵 15~20초 단계의 작은 주제 버튼 (`.bt-topic-btn`, §11.1).
 * 화면 가장자리·opacity .9 — 무시해도 부담 없는 크기. 상대 영상을 가리지 않는다.
 */
export function TopicButton({ className, children, type = 'button', ...rest }: TopicButtonProps) {
  return (
    <button type={type} className={cn('bt-topic-btn', className)} {...rest}>
      {children}
    </button>
  )
}
