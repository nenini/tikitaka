import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import { Hedge } from '../ui/Hedge'
import { IconButton } from '../ui/IconButton'

export interface CoachToastProps {
  /**
   * 이 메시지의 식별자. 값이 바뀌면 자동 사라짐 타이머가 처음부터 다시 시작된다.
   * 같은 문구의 코칭이 연속으로 들어와도 표시 시간이 온전히 보장된다.
   */
  messageId?: string | number
  title: ReactNode
  text?: ReactNode
  /** AI 추정 헤지 배지 표시 (표정/감정/반응 추정이면 필수) */
  hedge?: boolean
  /** 긴급 코칭 (테두리 강조). 그래도 화면을 덮지 않는다 */
  urgent?: boolean
  /** ms 후 자동 사라짐. onDismiss 와 함께 사용 */
  autoDismissMs?: number
  /** 주면 우상단 닫기 버튼이 함께 렌더된다 */
  onDismiss?: () => void
  className?: string
}

/**
 * 실시간 AI 코칭 토스트 (`.bt-coach`) — 본인 화면 전용(§10).
 * 원칙: 화면을 막지 않는다 · 한 번에 하나 · 스스로 사라진다 · 조용히 등장(560ms)한다.
 *
 * 접근성: aria-live="polite" 로만 알린다. assertive 금지(대화 방해).
 * 자동 사라짐과 별개로 사용자가 즉시 치울 수 있는 닫기 버튼을 제공한다.
 */
export function CoachToast({
  messageId,
  title,
  text,
  hedge = false,
  urgent = false,
  autoDismissMs,
  onDismiss,
  className,
}: CoachToastProps) {
  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return
    const timer = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(timer)
    // messageId 가 바뀌면 타이머를 재시작한다.
  }, [messageId, autoDismissMs, onDismiss])

  return (
    <div className={cn('bt-coach', urgent && 'bt-coach--urgent', className)} role="status" aria-live="polite">
      <span className="bt-coach__icon" aria-hidden="true">
        <Icon name="sparkle" size={15} />
      </span>
      <div className="bt-coach__body">
        <div className="bt-coach__title">{title}</div>
        {text != null && <div className="bt-coach__text">{text}</div>}
        {hedge && (
          <div className="bt-coach__hedge">
            <Hedge />
          </div>
        )}
      </div>
      {onDismiss && (
        <IconButton icon="close" aria-label="코칭 메시지 닫기" className="bt-coach__close" onClick={onDismiss} />
      )}
    </div>
  )
}
