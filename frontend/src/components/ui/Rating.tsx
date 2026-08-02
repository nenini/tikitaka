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
  /**
   * 양 끝 앵커 라벨 (예: `['그저 그랬어요', '아주 좋았어요']`).
   * 숫자만 두면 1이 좋은 쪽인지 나쁜 쪽인지 알 수 없다 — 척도에는 방향 표시가 필요하다.
   * 각 숫자의 aria-label 에도 끝점 문구가 함께 붙는다.
   */
  anchors?: readonly [string, string]
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
  anchors,
}: RatingProps) {
  const autoName = useId()
  const groupName = name ?? autoName
  const items = Array.from({ length: max }, (_, i) => i + 1)

  const scale = (
    <fieldset className="bt-rating" disabled={disabled}>
      <legend className="bt-sr-only">{ariaLabel}</legend>
      {items.map((n) => {
        const checked = value === n
        // 끝점에는 앵커 문구를 함께 읽어준다 — "1점"만으로는 방향을 알 수 없다.
        const anchorHint = anchors && (n === 1 ? anchors[0] : n === max ? anchors[1] : null)
        return (
          <label key={n} className="bt-rating__item" data-checked={checked || undefined}>
            {/* 이름은 aria-label 로 못박는다 — 숫자만 읽고 끝나지 않게 "n점"으로 나간다 */}
            <input
              type="radio"
              className="bt-sr-only"
              name={groupName}
              value={n}
              checked={checked}
              aria-label={anchorHint ? `${n}점 — ${anchorHint}` : `${n}점`}
              onChange={() => onChange(n)}
            />
            <span>{n}</span>
          </label>
        )
      })}
    </fieldset>
  )

  if (!anchors) return <div className={className}>{scale}</div>

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {scale}
      {/* 시각적 앵커. 스크린리더에는 위 aria-label 로 이미 전달되므로 중복 낭독을 막는다 */}
      <div className="bt-caption bt-muted flex justify-between gap-2" aria-hidden="true">
        <span>{anchors[0]}</span>
        <span>{anchors[1]}</span>
      </div>
    </div>
  )
}
