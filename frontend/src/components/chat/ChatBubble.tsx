import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'
import { VisuallyHidden } from '../layout/primitives'

export type ChatBubbleSide = 'me' | 'them'

export interface ChatBubbleProps extends HTMLAttributes<HTMLDivElement> {
  /** 'me' = 오른쪽 액션색 말풍선, 'them' = 왼쪽 중립 말풍선 */
  side: ChatBubbleSide
  /**
   * 발신자 이름. 시각적으로는 좌우 정렬로 구분되지만 스크린리더에는 구분 단서가 없으므로
   * 본문 앞에 숨은 텍스트로 함께 읽힌다(§8 "색만으로 알리지 않는다").
   */
  senderLabel: string
  /** 말풍선 아래 메타(전송 시각 등) */
  meta?: ReactNode
  /** 말풍선 아래 액션(피드백 보기 등) */
  actions?: ReactNode
  children: ReactNode
}

/**
 * 대화 말풍선 (`.bt-bubble`). AI 챗봇 대화(W-10b)·대화 이력에서 사용.
 *
 *   <ChatBubble side="them" senderLabel="지우" meta="14:02">안녕하세요!</ChatBubble>
 */
export function ChatBubble({
  side,
  senderLabel,
  meta,
  actions,
  className,
  children,
  ...rest
}: ChatBubbleProps) {
  return (
    <div
      className={cn('bt-bubble-row', side === 'me' ? 'bt-bubble-row--me' : 'bt-bubble-row--them', className)}
      {...rest}
    >
      <div className={cn('bt-bubble', side === 'me' ? 'bt-bubble--me' : 'bt-bubble--them')}>
        <VisuallyHidden>{senderLabel}: </VisuallyHidden>
        {children}
      </div>
      {meta != null && <span className="bt-bubble__meta">{meta}</span>}
      {actions != null && <div className="bt-bubble__actions">{actions}</div>}
    </div>
  )
}
