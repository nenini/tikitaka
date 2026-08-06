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
  /**
   * 표기 방식.
   *
   * - `clock`(기본) — `mm:ss`. 30분 세션처럼 **한 시간을 넘지 않는** 카운트다운용이다.
   * - `duration` — 일·시·분. 시작 시각까지처럼 **며칠 뒤일 수도 있는** 값에 쓴다.
   *
   * `clock` 은 한 시간을 넘으면 분이 그대로 커진다(32시간 → `1919:00`). 세션 타이머에서는
   * 일어나지 않는 일이지만 대기방의 '시작까지' 는 실제로 그렇게 나왔다.
   */
  variant?: 'clock' | 'duration'
  className?: string
}

const DEFAULT_THRESHOLDS: SessionTimerThresholds = { warning: 300, critical: 60 }
const DEFAULT_ANNOUNCE_AT: readonly number[] = [300, 60, 30, 10]

/** 초 단위를 보여주기 시작하는 경계. 이보다 길면 초가 바뀌어도 할 일이 달라지지 않는다. */
const SECONDS_VISIBLE_BELOW = 10 * 60

function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 긴 대기용 표기. 큰 단위 두 개까지만 적는다 — `2일 8시간 5분 3초` 는 읽는 데 시간이 걸린다.
 * 10분 미만은 곧 시작한다는 뜻이라 초까지 보여준다.
 */
function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  if (s < SECONDS_VISIBLE_BELOW) return formatClock(s)

  const days = Math.floor(s / 86_400)
  const hours = Math.floor((s % 86_400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)

  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
  return `${minutes}분`
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
  variant = 'clock',
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
        <span className="bt-numeric">
          {variant === 'duration' ? formatDuration(remainingSec) : formatClock(remainingSec)}
        </span>
      </span>
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </>
  )
}
