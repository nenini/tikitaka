import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'

export interface QuestionOption {
  id: string
  text: ReactNode
}

/** 옵션이 비동기로 생성되므로 로딩/빈 결과/생성 실패를 모두 표현할 수 있어야 한다. */
export type QuestionCardState = 'ready' | 'loading' | 'empty' | 'error'

export interface QuestionCardProps {
  /** 상단 캡션 (기본: "이런 질문은 어때요? · 나에게만 보여요") — 그룹의 접근 가능한 이름이 된다 */
  caption?: ReactNode
  options?: readonly QuestionOption[]
  onSelect: (id: string) => void
  /** 미지정 시 options 유무로 ready/loading 을 추론한다 */
  state?: QuestionCardState
  /** 선택된 옵션 (선택 즉시 표시용) */
  selectedId?: string
  /** 전체 비활성 (전송 중 등) */
  disabled?: boolean
  /** error 상태일 때 재시도 버튼 */
  onRetry?: () => void
  /**
   * 옵션 배치. 기본 'column'(세로 스택).
   * 'row' 는 가로 캐러셀 — 영상 위에 얹혀 **상대 얼굴을 가리면 안 되는** 세션 화면에서 쓴다.
   */
  orientation?: 'column' | 'row'
  className?: string
}

/**
 * 침묵 30초+ 단계의 선택형 질문 카드 (`.bt-question-card`, §11.1).
 * 본인 화면 전용 — 여전히 상대 영상을 가리지 않는다.
 *
 * 접근성: 그룹에는 이름이 필요하다. 캡션을 aria-labelledby 로 연결한다.
 */
export function QuestionCard({
  caption,
  options,
  onSelect,
  state,
  selectedId,
  disabled = false,
  onRetry,
  orientation = 'column',
  className,
}: QuestionCardProps) {
  const captionId = `${useId()}-caption`
  const resolvedState: QuestionCardState = state ?? (options == null ? 'loading' : options.length === 0 ? 'empty' : 'ready')

  return (
    <div
      className={cn('bt-question-card', orientation === 'row' && 'bt-question-card--row', className)}
      role="group"
      aria-labelledby={captionId}
      aria-busy={resolvedState === 'loading' || undefined}
    >
      <div className="bt-caption bt-question-card__caption" id={captionId}>
        {caption ?? '이런 질문은 어때요? · 나에게만 보여요'}
      </div>

      {resolvedState === 'loading' && (
        <>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
          <span className="bt-sr-only">질문을 만들고 있어요</span>
        </>
      )}

      {resolvedState === 'empty' && <p className="bt-question-card__notice">지금은 추천할 질문이 없어요.</p>}

      {resolvedState === 'error' && (
        <>
          <p className="bt-question-card__notice">질문을 만들지 못했어요.</p>
          {onRetry && (
            <Button variant="tonal" size="sm" leadingIcon="refresh" onClick={onRetry}>
              다시 시도
            </Button>
          )}
        </>
      )}

      {/* row 모드에서 이 래퍼만 가로 스크롤러가 된다. column 모드에서는 display:contents 라
          카드의 flex 흐름에 그대로 참여해 렌더 결과가 기존과 동일하다. */}
      {resolvedState === 'ready' && (
        <div className="bt-question-card__options">
          {options?.map((option) => (
            <button
              key={option.id}
              type="button"
              className="bt-question-card__option"
              aria-pressed={selectedId === option.id}
              disabled={disabled}
              onClick={() => onSelect(option.id)}
            >
              {option.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
