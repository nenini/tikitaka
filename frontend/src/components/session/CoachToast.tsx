import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Icon } from '@/components/Icon'
import { Hedge } from '@/components/ui/Hedge'

export interface CoachToastProps {
  title: ReactNode
  text?: ReactNode
  /** AI 추정 헤지 배지 표시 (표정/감정/반응 추정이면 필수) */
  hedge?: boolean
  /** 긴급 코칭 (테두리 강조). 그래도 화면을 덮지 않는다 */
  urgent?: boolean
  /** ms 후 자동 사라짐. onDismiss 와 함께 사용 */
  autoDismissMs?: number
  onDismiss?: () => void
  className?: string
}

/**
 * 실시간 AI 코칭 토스트 (`.bt-coach`) — 본인 화면 전용(§10).
 * 원칙: 화면을 막지 않는다 · 한 번에 하나 · 스스로 사라진다 · 조용히 등장(560ms)한다.
 * 접근성: aria-live="polite" 로만 알린다. assertive 금지(대화 방해).
 */
export function CoachToast({ title, text, hedge = false, urgent = false, autoDismissMs, onDismiss, className }: CoachToastProps) {
  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return
    const t = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(t)
  }, [autoDismissMs, onDismiss])

  return (
    <div className={cn('bt-coach', urgent && 'bt-coach--urgent', className)} role="status" aria-live="polite">
      <span className="bt-coach__icon">
        <Icon name="sparkle" size={15} />
      </span>
      <div className="bt-coach__body">
        <div className="bt-coach__title">{title}</div>
        {text != null && <div className="bt-coach__text">{text}</div>}
        {hedge && (
          <div style={{ marginTop: 8 }}>
            <Hedge />
          </div>
        )}
      </div>
    </div>
  )
}
