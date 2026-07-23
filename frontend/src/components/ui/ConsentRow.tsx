import type { ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'
import { Badge } from './Badge'
import { Switch } from './Switch'

export interface ConsentRowProps {
  title: ReactNode
  desc?: ReactNode
  /** 필수 동의 여부 — 배지로 표기. 필수 항목은 토글을 강제 on/disabled 로 다룰 수 있다 */
  required?: boolean
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * 목적별 동의 행 (`.bt-consent`).
 * ⚠️ 전체 동의 하나로 묶지 않는다. 각 항목은 개별 토글이고, 선택 동의를 다 꺼도 기본 기능은 동작해야 한다.
 * 처리 기준(보관·삭제)을 desc 에 그대로 노출한다.
 */
export function ConsentRow({ title, desc, required = false, checked, onCheckedChange, disabled, className }: ConsentRowProps) {
  const labelText = typeof title === 'string' ? title : '동의 항목'
  return (
    <div className={cn('bt-consent', className)}>
      <div className="bt-consent__main">
        <div className="bt-consent__title">
          {title}
          {required ? <Badge tone="danger">필수</Badge> : <Badge>선택</Badge>}
        </div>
        {desc != null && <div className="bt-consent__desc">{desc}</div>}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={`${labelText} 동의`}
        onChange={(e) => onCheckedChange(e.currentTarget.checked)}
      />
    </div>
  )
}
