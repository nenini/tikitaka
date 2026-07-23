import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/shared/lib/cn'

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** 트랙 옆 라벨 (없으면 aria-label 필수) */
  label?: ReactNode
  ref?: Ref<HTMLInputElement>
}

/** 토글 스위치 (`.bt-switch`). 환경음·동의 등. */
export function Switch({ label, className, ref, ...rest }: SwitchProps) {
  return (
    <label className={cn('bt-switch', className)}>
      <input className="bt-switch__input" type="checkbox" ref={ref} {...rest} />
      <span className="bt-switch__track" />
      {label != null && <span className="bt-body-sm">{label}</span>}
    </label>
  )
}
