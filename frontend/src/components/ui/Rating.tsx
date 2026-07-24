import { useId } from 'react'
import { cn } from '../../shared/lib/cn'

export interface RatingProps {
  /** 선택값 (1~max). 미선택은 undefined */
  value?: number
  onChange: (value: number) => void
  /** 최대 점수 (기본 5) */
  max?: number
  'aria-label': string
  /** 폼 전송 시 사용할 name (미지정 시 자동 생성) */
  name?: string
  disabled?: boolean
  className?: string
}

/**
 * 1~max 점 상호 평가 (`.bt-rating`, §15.2).
 *
 * 네이티브 radio 기반 — 방향키 탐색·그룹 포커스·폼 전송이 브라우저 기본 동작으로 동작한다.
 * (버튼 + `role="radio"` 는 클릭만 되고 라디오 그룹에서 기대하는 키보드 동작이 없다.)
 */
export function Rating({
  value,
  onChange,
  max = 5,
  'aria-label': ariaLabel,
  name,
  disabled = false,
  className,
}: RatingProps) {
  const autoName = useId()
  const groupName = name ?? autoName
  const items = Array.from({ length: max }, (_, i) => i + 1)

  return (
    <fieldset className={cn('bt-rating', className)} disabled={disabled}>
      <legend className="bt-sr-only">{ariaLabel}</legend>
      {items.map((n) => {
        const checked = value === n
        return (
          <label key={n} className="bt-rating__item" data-checked={checked || undefined}>
            {/* 이름은 aria-label 로 못박는다 — 숫자만 읽고 끝나지 않게 "n점"으로 나간다 */}
            <input
              type="radio"
              className="bt-sr-only"
              name={groupName}
              value={n}
              checked={checked}
              aria-label={`${n}점`}
              onChange={() => onChange(n)}
            />
            <span>{n}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
