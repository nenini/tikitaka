import type { HTMLAttributes } from 'react'
import { cn } from '../../shared/lib/cn'
import { VisuallyHidden } from '../layout/primitives'

export interface TypingIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  /** 누가 쓰고 있는지 — 스크린리더 문구에 들어간다 */
  name?: string
}

/**
 * 답장 생성 중 표시 (`.bt-typing`). 상대 말풍선 자리에 그대로 들어간다.
 *
 * `role="status"` 로 한 번만 알리고, 스트리밍 중인 본문 자체는 알리지 않는다.
 * (글자가 늘어날 때마다 읽으면 대화가 아니라 소음이 된다 — §8)
 */
export function TypingIndicator({ name = '상대', className, ...rest }: TypingIndicatorProps) {
  return (
    <div className={cn('bt-bubble-row bt-bubble-row--them', className)} {...rest}>
      <div className="bt-typing" role="status">
        <span className="bt-typing__dot" aria-hidden="true" />
        <span className="bt-typing__dot" aria-hidden="true" />
        <span className="bt-typing__dot" aria-hidden="true" />
        <VisuallyHidden>{name}이(가) 답장을 작성하고 있어요</VisuallyHidden>
      </div>
    </div>
  )
}
