import { useEffect, useRef, useState } from 'react'
import { cn } from '../../shared/lib/cn'
import { VisuallyHidden } from '../layout/primitives'

export interface SessionTimerThresholds {
  /** 주의 전환 임계값(초). 기본 300 = 5분 */
  warning: number
  /** 경고 전환 임계값(초). warning 이하여야 한다. 기본 60 = 1분 */
  critical: number
}

export interface SessionTimerProps {
  /** 남은 시간(초) */
  remainingSec: number
  /** 앞에 붙일 라벨 (예: "남은 시간"). 생략 시 시간만 */
  label?: string
  /** 색 전환 임계값. warning > critical 관계가 강제된다 */
  thresholds?: SessionTimerThresholds
  /**
   * 음성 안내를 발생시킬 시점(초). 기본 5분·1분·30초·10초.
   * 빈 배열이면 안내하지 않는다.
   */
  announceAt?: readonly number[]
  className?: string
}

const DEFAULT_THRESHOLDS: SessionTimerThresholds = { warning: 300, critical: 60 }
const DEFAULT_ANNOUNCE_AT: readonly number[] = [300, 60, 30, 10]

function format(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 300 → "5분", 30 → "30초" */
function spoken(sec: number): string {
  return sec >= 60 && sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`
}

/**
 * 세션 타이머 (`.bt-timer`, §9.2). 30분 세션 카운트다운.
 * 5분 전 --soon(앰버), 1분 전 --last(빨강+펄스)로 자동 전환된다.
 *
 * 접근성: 표시 영역은 **live region 이 아니다**(`aria-live="off"`). 매초 갱신되는 값을 live 로 두면
 * 스크린리더가 통화 내내 남은 시간을 초마다 다시 읽어 대화를 방해한다.
 * 대신 임계 시점(5분·1분·30초·10초)에만 별도 status 영역으로 한 번씩 알린다.
 *
 * ⚠️ remainingSec 는 부모가 setInterval 로 관리하고 값만 내려준다.
 */
export function SessionTimer({
  remainingSec,
  label,
  thresholds = DEFAULT_THRESHOLDS,
  announceAt = DEFAULT_ANNOUNCE_AT,
  className,
}: SessionTimerProps) {
  const { warning, critical } = thresholds

  if (import.meta.env.DEV && critical > warning) {
    console.warn(
      `[SessionTimer] thresholds.critical(${critical})는 warning(${warning}) 이하여야 상태 구분이 의도대로 동작합니다.`,
    )
  }

  const state = remainingSec <= critical ? 'last' : remainingSec <= warning ? 'soon' : 'normal'

  // 임계 시점을 지나는 순간에만 안내 문구를 갱신한다.
  const [announcement, setAnnouncement] = useState('')
  const lastAnnounced = useRef<number | null>(null)

  useEffect(() => {
    if (announceAt.length === 0) return
    // 도달한 임계값 중 **가장 촘촘한(작은)** 것을 고른다.
    // 42초라면 300·60 둘 다 넘어섰지만 사용자에게 유효한 안내는 "1분 남았어요"다.
    const reached = [...announceAt].sort((a, b) => a - b).find((t) => remainingSec <= t)

    if (reached == null) {
      lastAnnounced.current = null
      setAnnouncement('')
      return
    }
    if (lastAnnounced.current === reached) return
    lastAnnounced.current = reached
    setAnnouncement(`${spoken(reached)} 남았어요`)
  }, [remainingSec, announceAt])

  return (
    <>
      <span
        className={cn('bt-timer', state === 'soon' && 'bt-timer--soon', state === 'last' && 'bt-timer--last', className)}
        role="timer"
        aria-live="off"
      >
        <span className="bt-timer__dot" aria-hidden="true" />
        {label && <span>{label}</span>}
        <span className="bt-numeric">{format(remainingSec)}</span>
      </span>
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </>
  )
}
