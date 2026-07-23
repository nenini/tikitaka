import { cn } from '@/shared/lib/cn'

export interface RatingProps {
  /** 선택값 (1~max). 미선택은 0/undefined */
  value?: number
  onChange: (value: number) => void
  /** 최대 점수 (기본 5) */
  max?: number
  'aria-label': string
  className?: string
}

/** 1~5점 상호 평가 (`.bt-rating`). radiogroup 시맨틱. */
export function Rating({ value, onChange, max = 5, 'aria-label': ariaLabel, className }: RatingProps) {
  const items = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div className={cn('bt-rating', className)} role="radiogroup" aria-label={ariaLabel}>
      {items.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          className="bt-rating__item"
          aria-checked={value === n}
          aria-label={`${n}점`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
