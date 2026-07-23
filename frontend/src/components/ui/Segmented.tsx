import { cn } from '@/shared/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label'?: string
  className?: string
}

/**
 * 세그먼티드 컨트롤 (`.bt-segmented`) — 코칭 개입 강도(흐름 우선/균형/적극) 등.
 * 3개 이하 상호 배타 옵션에 사용.
 */
export function Segmented<T extends string>({ options, value, onChange, 'aria-label': ariaLabel, className }: SegmentedProps<T>) {
  return (
    <div className={cn('bt-segmented', className)} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          className="bt-segmented__item"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
