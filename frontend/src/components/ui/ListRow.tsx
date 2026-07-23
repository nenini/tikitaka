import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/shared/lib/cn'

export interface ListRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** 왼쪽 요소 (아바타 등) */
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  /** 오른쪽 요소 (점수 링·뱃지·chevron 등) */
  trailing?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/** 목록 행 (`.bt-row`) — 연습 기록 등. 기본은 클릭 가능한 버튼. */
export function ListRow({ leading, title, meta, trailing, className, ref, type = 'button', ...rest }: ListRowProps) {
  return (
    <button ref={ref} type={type} className={cn('bt-row', className)} {...rest}>
      {leading}
      <span className="bt-row__main">
        <span className="bt-row__title">{title}</span>
        {meta != null && <span className="bt-row__meta" style={{ display: 'block' }}>{meta}</span>}
      </span>
      {trailing}
    </button>
  )
}
