import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** radiogroup 이름 — 필수. 무엇을 고르는 컨트롤인지 알려준다 */
  'aria-label': string
  /** 폼 전송 시 사용할 name (미지정 시 자동 생성) */
  name?: string
  /** 그룹 전체 비활성 */
  disabled?: boolean
  className?: string
}

/**
 * 세그먼티드 컨트롤 (`.bt-segmented`) — 코칭 개입 강도(흐름 우선/균형/적극) 등.
 *
 * 탭이 아니라 **상호 배타적인 값 선택**이므로 네이티브 radio 기반이다.
 * `role="tab"` 은 연결된 tabpanel·방향키 이동·roving tabIndex 가 모두 갖춰졌을 때만 쓴다.
 * 네이티브 radio 를 쓰면 방향키 탐색·폼 연동·그룹 포커스가 브라우저 기본 동작으로 따라온다.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  name,
  disabled = false,
  className,
}: SegmentedProps<T>) {
  const autoName = useId()
  const groupName = name ?? autoName

  return (
    <fieldset className={cn('bt-segmented', className)} disabled={disabled}>
      <legend className="bt-sr-only">{ariaLabel}</legend>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <label key={option.value} className="bt-segmented__item" data-selected={selected || undefined}>
            <input
              type="radio"
              className="bt-sr-only"
              name={groupName}
              value={option.value}
              checked={selected}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
