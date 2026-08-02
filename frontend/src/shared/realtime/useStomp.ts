import { useEffect, useRef, useState } from 'react'
import { acquireStomp } from './stompClient'
import type { StompConnection, StompMessageHandler, StompState } from './stompClient'

/**
 * 공유 STOMP 연결을 컴포넌트 수명에 묶는다.
 * `enabled` 가 false 면 연결을 잡지 않는다(세션 id 가 없을 때 등).
 */
export function useStomp(enabled = true): { connection: StompConnection | null; state: StompState } {
  const [connection, setConnection] = useState<StompConnection | null>(null)
  const [state, setState] = useState<StompState>('idle')

  useEffect(() => {
    if (!enabled) {
      setConnection(null)
      setState('idle')
      return
    }
    const conn = acquireStomp()
    setConnection(conn)
    setState(conn.state)
    const off = conn.onStateChange(setState)
    return () => {
      off()
      conn.release()
      setConnection(null)
    }
  }, [enabled])

  return { connection, state }
}

/**
 * destination 하나를 구독한다. handler 는 ref 로 잡아두므로 매 렌더 새 함수를 넘겨도
 * 재구독이 일어나지 않는다 — 재구독은 destination 이 바뀔 때만 한다.
 */
export function useStompSubscription(
  connection: StompConnection | null,
  destination: string | null,
  handler: StompMessageHandler,
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!connection || !destination) return
    return connection.subscribe(destination, (body, headers) => handlerRef.current(body, headers))
  }, [connection, destination])
}
