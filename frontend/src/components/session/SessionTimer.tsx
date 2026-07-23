import { cn } from '@/shared/lib/cn'

export interface SessionTimerProps {
  /** 남은 시간(초) */
  remainingSec: number
  /** 앞에 붙일 라벨 (예: "남은 시간"). 생략 시 시간만 */
  label?: string
  /** soon(주의) 임계값 초. 기본 300(5분) */
  soonSec?: number
  /** last(경고) 임계값 초. 기본 60(1분) */
  lastSec?: number
  className?: string
}

function format(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * 세션 타이머 (`.bt-timer`, §9.2). 30분 세션 카운트다운.
 * 5분 전 --soon(앰버), 1분 전 --last(빨강+펄스)로 자동 전환된다.
 * ⚠️ remainingSec 는 저빈도 상태다. 초당 갱신은 부모에서 setInterval 로 관리하고 값만 내려준다.
 */
export function SessionTimer({ remainingSec, label, soonSec = 300, lastSec = 60, className }: SessionTimerProps) {
  const state = remainingSec <= lastSec ? 'last' : remainingSec <= soonSec ? 'soon' : 'normal'
  return (
    <span
      className={cn('bt-timer', state === 'soon' && 'bt-timer--soon', state === 'last' && 'bt-timer--last', className)}
      role="timer"
      aria-live={state === 'normal' ? 'off' : 'polite'}
    >
      <span className="bt-timer__dot" />
      {label && <span>{label}</span>}
      <span className="bt-numeric">{format(remainingSec)}</span>
    </span>
  )
}
