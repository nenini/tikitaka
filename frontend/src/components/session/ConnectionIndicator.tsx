import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import { Spinner } from '../ui/Spinner'

/**
 * 통화 종료와 네트워크 단절은 **다른 사건**이다. 같은 화면으로 처리하면
 * "상대가 나갔다"와 "내 인터넷이 끊겼다"를 사용자가 구분할 수 없다.
 */
export type ConnectionState = 'connecting' | 'connected' | 'unstable' | 'reconnecting' | 'disconnected'

export interface ConnectionIndicatorProps {
  state: ConnectionState
  /** 라벨 텍스트 없이 아이콘만 (상태는 스크린리더로 계속 전달된다) */
  iconOnly?: boolean
  className?: string
}

const STATE_TEXT: Record<ConnectionState, string> = {
  connecting: '연결 중',
  connected: '연결됨',
  unstable: '연결 불안정',
  reconnecting: '재연결 중',
  disconnected: '연결 끊김',
}

/**
 * 세션 연결 상태 표시 (`.bt-conn`).
 * 색만으로 알리지 않는다 — 아이콘 + 텍스트를 함께 낸다.
 * 상태 변화는 polite live region 으로 한 번씩만 알린다(값이 바뀔 때만 갱신되므로 과도한 낭독이 없다).
 */
export function ConnectionIndicator({ state, iconOnly = false, className }: ConnectionIndicatorProps) {
  const text = STATE_TEXT[state]
  const busy = state === 'connecting' || state === 'reconnecting'

  return (
    <span
      className={cn('bt-conn', `bt-conn--${state}`, className)}
      role="status"
      aria-live="polite"
      aria-label={iconOnly ? text : undefined}
    >
      {busy ? (
        <Spinner size={12} label={null} />
      ) : (
        <Icon name={state === 'disconnected' ? 'warning' : 'signal'} size={14} />
      )}
      {!iconOnly && <span>{text}</span>}
    </span>
  )
}
