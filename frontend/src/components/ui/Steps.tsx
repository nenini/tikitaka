import { Fragment } from 'react'
import { cn } from '@/shared/lib/cn'

export interface StepsProps {
  /** 전체 스텝 수 */
  count: number
  /** 현재 활성 스텝 (1-indexed) */
  current: number
  /** 각 스텝의 라벨(선택). 미완료 스텝은 번호로 표시된다 */
  labels?: string[]
  className?: string
}

/**
 * 온보딩/설문 진행 스텝 (`.bt-steps`).
 * current 미만은 완료(✓), current 는 활성, 초과는 대기.
 */
export function Steps({ count, current, labels, className }: StepsProps) {
  const steps = Array.from({ length: count }, (_, i) => i + 1)
  return (
    <div className={cn('bt-steps', className)} role="list" aria-label={`${count}단계 중 ${current}단계`}>
      {steps.map((n, i) => {
        const done = n < current
        const active = n === current
        return (
          <Fragment key={n}>
            <span
              className={cn('bt-steps__dot', done && 'is-done', active && 'is-active')}
              role="listitem"
              aria-current={active ? 'step' : undefined}
              title={labels?.[i]}
            >
              {done ? '✓' : n}
            </span>
            {i < steps.length - 1 && <span className="bt-steps__line" />}
          </Fragment>
        )
      })}
    </div>
  )
}
