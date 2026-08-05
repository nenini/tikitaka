import { useEffect, useRef, useState } from 'react'
import { tokenStore } from '@/shared/api/tokens'
import { notificationStreamUrl } from './api'
import { drainFrames, parseFrame } from './sseFrame'
import type { NotificationResponse } from './types'

/* -------------------------------------------------------------------------- */
/*  알림 SSE (NOTIFY-01)                                                       */
/*                                                                            */
/*  ⚠️ 네이티브 `EventSource` 를 쓸 수 없다.                                    */
/*     서버 `JwtAuthenticationFilter` 는 **Authorization 헤더만** 읽고           */
/*     `SecurityConfig` 가 `/api/v1/notifications/**` 를 authenticated() 로     */
/*     건다. 토큰을 쿼리로 받는 경로가 없는데 `EventSource` 는 헤더를 붙일 수     */
/*     없다 → fetch + ReadableStream 으로 직접 읽는다.                          */
/* -------------------------------------------------------------------------- */

/** 재접속 백오프. 서버가 죽어 있을 때 초당 재시도로 두들기지 않는다. */
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

export type StreamState = 'idle' | 'connecting' | 'open' | 'closed'

export interface UseNotificationStreamOptions {
  /** 새 알림 도착. 중복 제거는 호출부(목록)가 id 로 판단한다. */
  onNotification: (notification: NotificationResponse) => void
  /**
   * (재)연결이 열린 직후. 끊긴 동안 온 알림은 스트림으로 오지 않으므로
   * 목록을 한 번 다시 읽어야 구멍이 생기지 않는다.
   */
  onReconnected?: () => void
  enabled?: boolean
}

/**
 * 알림 실시간 수신.
 *
 * 서버 이벤트 이름은 `connected`(구독 확인)과 `notification`(새 알림) 두 가지다
 * (`NotificationSseService`). 주기적으로 주석 하트비트도 온다.
 */
export function useNotificationStream({
  onNotification,
  onReconnected,
  enabled = true,
}: UseNotificationStreamOptions): { state: StreamState } {
  const [state, setState] = useState<StreamState>('idle')

  // 콜백이 매 렌더 새로 생겨도 스트림을 다시 열지 않도록 ref 로 우회한다.
  const onNotificationRef = useRef(onNotification)
  const onReconnectedRef = useRef(onReconnected)
  onNotificationRef.current = onNotification
  onReconnectedRef.current = onReconnected

  useEffect(() => {
    if (!enabled) {
      setState('idle')
      return
    }

    const controller = new AbortController()
    let retryTimer: number | undefined
    let attempt = 0
    /** 언마운트 후 늦게 도착한 응답이 상태를 되살리지 못하게 막는 플래그. */
    let stopped = false

    async function connect() {
      if (stopped) return
      const token = tokenStore.getAccess()
      if (!token) {
        setState('closed')
        return
      }

      setState('connecting')
      try {
        const response = await fetch(notificationStreamUrl(), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        })

        // 401 은 재시도해도 같은 결과다. 토큰 갱신은 apiClient 인터셉터 소관이고,
        // 여기서 다시 붙으면 만료된 토큰으로 무한 루프를 돈다.
        if (response.status === 401 || response.status === 403) {
          setState('closed')
          return
        }
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`)

        setState('open')
        const wasRetry = attempt > 0
        attempt = 0
        if (wasRetry) onReconnectedRef.current?.()

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // 프레임 경계는 빈 줄이다. 덜 온 조각은 버퍼에 남는다(drainFrames 주석 참고).
          const { frames, rest } = drainFrames(buffer)
          buffer = rest

          for (const frame of frames) {
            const parsed = parseFrame(frame)
            if (!parsed || parsed.event !== 'notification') continue
            try {
              onNotificationRef.current(JSON.parse(parsed.data) as NotificationResponse)
            } catch {
              /* 깨진 프레임 하나 때문에 스트림 전체를 끊지 않는다 */
            }
          }
        }
        // 서버가 정상 종료(타임아웃 등)했다 — 아래 catch 와 같은 경로로 재접속한다.
        throw new Error('stream closed')
      } catch (error) {
        if (stopped || (error instanceof DOMException && error.name === 'AbortError')) return
        setState('closed')
        const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS)
        attempt += 1
        retryTimer = window.setTimeout(connect, delay)
      }
    }

    void connect()

    return () => {
      stopped = true
      controller.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [enabled])

  return { state }
}
