import { useId, useState } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'

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

  /**
   * 마우스를 올린 지점까지 미리 채워 보여준다.
   * 이게 없으면 하트가 누적 척도가 아니라 **체크박스 5개**처럼 느껄진다 —
   * 4를 누를 때 1~3도 함께 켜진다는 걸 눌러보기 전에 알 수 없다.
   */
  const [hovered, setHovered] = useState<number | null>(null)
  const filledUpTo = hovered ?? value ?? 0

  const scale = (
    <fieldset
      className="bt-rating"
      disabled={disabled}
      // 개별 항목이 아니라 그룹에서 푼다 — 항목끼리 옮겨다닐 때 깜빡이지 않는다
      onMouseLeave={() => setHovered(null)}
    >
      <legend className="bt-sr-only">{ariaLabel}</legend>
      {items.map((n) => {
        const checked = value === n
        // 끝점에는 앵커 문구를 함께 읽어준다 — "1점"만으로는 방향을 알 수 없다.
        const anchorHint = anchors && (n === 1 ? anchors[0] : n === max ? anchors[1] : null)
        return (
          <label
            key={n}
            className="bt-rating__item"
            data-filled={n <= filledUpTo || undefined}
            data-checked={checked || undefined}
            onMouseEnter={disabled ? undefined : () => setHovered(n)}
          >
            {/* 이름은 aria-label 로 못박는다 — 하트 모양은 읽히지 않으므로 "n점"으로 나간다 */}
            <input
              type="radio"
              className="bt-sr-only"
              name={groupName}
              value={n}
              checked={checked}
              aria-label={anchorHint ? `${n}점 — ${anchorHint}` : `${n}점`}
              onChange={() => onChange(n)}
            />
            {/* 채워짐은 색이 아니라 **모양**으로도 구분된다 — 색만으로 구분하면 안 된다 */}
            <Icon name={n <= filledUpTo ? 'heart-fill' : 'heart'} size={26} aria-hidden />
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
