import type { CSSProperties, HTMLAttributes } from 'react'
import { cn } from '../../shared/lib/cn'

export interface ScoreRingProps extends HTMLAttributes<HTMLDivElement> {
  /** 0~100 */
  value: number
  /** 44px 소형 */
  small?: boolean
  /** 링 아래 단위/설명 (예: "Good!") */
  unit?: string
  /** 가운데 표시값 (기본은 value) */
  label?: string
}

/**
 * 점수 링 (`.bt-ring`).
 * ⚠️ 원칙 1: **대화 행동 점수 전용**. 외모·매력에 절대 붙이지 않는다. 옆에는 항상 근거 문장을 둔다.
 */
export function ScoreRing({ value, small = false, unit, label, className, style, ...rest }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn('bt-ring', small && 'bt-ring--sm', className)}
      style={{ ['--value' as string]: clamped, ...style } as CSSProperties}
      role="img"
      aria-label={`점수 ${clamped}점${unit ? ` · ${unit}` : ''}`}
      {...rest}
    >
      <div className="bt-ring__label">
        <span className="bt-ring__value">{label ?? clamped}</span>
        {unit && <span className="bt-ring__unit">{unit}</span>}
      </div>
    </div>
  )
}
