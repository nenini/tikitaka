import type { ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  text?: ReactNode
  /** 다음 행동을 제안하는 버튼 — 빈 화면은 막다른 길이 아니어야 한다 */
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
