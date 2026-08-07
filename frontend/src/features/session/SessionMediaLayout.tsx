import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { DarkScope, Spinner } from '@/components'
import { getSessionStatus } from './api'
import type { SessionStatus } from './types'
import { createApiTokenProvider } from './livekit/tokenProvider'
import { useLiveKitRoom } from './livekit/useLiveKitRoom'
import type { SessionMediaContext } from './useSessionMedia'

/* -------------------------------------------------------------------------- */
/*  세션 미디어 소유자 — 대기방(W-11)과 세션(W-12)이 공유한다.                  */
/*                                                                            */
/*  왜 레이아웃인가:                                                           */
/*  예전에는 세션 화면이 마운트되는 순간 처음 `room.connect()` 를 했다. 그래서    */
/*  입장 직후 약 5초간 ICE·DTLS 협상과 simulcast ramp-up 이 화면에 그대로 보였다. */
/*                                                                            */
/*  대기방에서 미리 붙여 두면 그 시간이 사용자가 보기 전에 지나간다. 다만 Room 을  */
/*  페이지 사이로 넘기려면 소유자가 두 화면보다 오래 살아야 한다 —              */
/*  **공통 부모 라우트**가 가장 안전한 자리다. 훅이 한 번만 마운트되므로          */
/*  리스너를 다시 붙이거나 이미 구독된 트랙으로 상태를 재구성할 일이 없다.        */
/*  (모듈 캐시로 Room 을 넘기는 방식은 `TrackSubscribed` 가 재발행되지 않아       */
/*   "연결은 됐는데 검은 화면" 이 되기 쉽다.)                                   */
/*                                                                            */
/*  해제는 라우팅이 알아서 맞춘다:                                              */
/*   - 대기방 → 세션 : 레이아웃 **안**이라 언마운트가 없다 → 연결 유지           */
/*   - 세션 → 평가/리포트/홈 : 레이아웃 **밖**이라 언마운트 → 기존 cleanup 이 정리 */
/* -------------------------------------------------------------------------- */

/** 세션 id 가 유효하지 않을 때 쓰는 no-op 토큰 공급자. 훅 인자를 비울 수 없어 자리만 채운다. */
const notConfiguredProvider = async () => {
  throw new Error('세션을 찾을 수 없어요.')
}

/** 세션이 이미 끝난 상태. 여기 해당하면 대기방·세션 화면을 **그리지 않는다**. */
const CLOSED_STATUSES: readonly SessionStatus[] = ['COMPLETED', 'CANCELLED']

/**
 * 종료된 세션의 접근 가드.
 *
 * `null` = 아직 판정 전, `'open'` = 통과, 그 외는 보낼 곳.
 *
 * ⚠️ **판정 전에는 자식을 그리지 않는다.** 예전에는 화면이 먼저 뜬 뒤 상태를 읽고 튕겨서,
 *    끝난 세션 주소를 열면 대기방이 한 번 보였다가 사라졌다. 그 사이 카메라 권한 팝업이
 *    뜨고 LiveKit 토큰까지 요청된다 — 끝난 세션에는 어느 쪽도 일어나면 안 된다.
 */
type Gate = null | 'open' | { redirect: string }

function useClosedSessionGate(sessionId: number, valid: boolean): Gate {
  const [gate, setGate] = useState<Gate>(null)

  useEffect(() => {
    if (!valid) {
      setGate({ redirect: '/' })
      return
    }
    let alive = true
    setGate(null)
    getSessionStatus(sessionId)
      .then((snapshot) => {
        if (!alive) return
        if (!CLOSED_STATUSES.includes(snapshot.status)) {
          setGate('open')
          return
        }
        // 정상 종료면 평가·리포트로 이어갈 수 있다. 취소된 세션은 이어갈 게 없어 홈으로.
        setGate({
          redirect:
            snapshot.status === 'COMPLETED' ? `/session/${sessionId}/review` : '/',
        })
      })
      .catch((error) => {
        if (!alive) return
        // 없는 세션·내 세션이 아님 → 홈. 그 외(네트워크·5xx)는 **열어 준다** —
        // 일시 장애로 정상 세션 입장을 막는 편이 더 나쁘고, 실제 입장은 서버가 다시 막는다.
        const status = (error as { response?: { status?: number } })?.response?.status
        setGate(status === 404 || status === 403 ? { redirect: '/' } : 'open')
      })
    return () => {
      alive = false
    }
  }, [sessionId, valid])

  return gate
}

export function SessionMediaLayout() {
  const { sessionId: sessionIdParam } = useParams()
  const sessionId = Number(sessionIdParam)
  const validSession = Number.isFinite(sessionId) && sessionId > 0

  const gate = useClosedSessionGate(sessionId, validSession)

  // 한 번 켜지면 되돌리지 않는다 — 대기방에서 붙인 연결을 세션이 그대로 물려받는다.
  const [enabled, setEnabled] = useState(false)
  const connect = useCallback(() => setEnabled(true), [])

  // getToken 이 매 렌더 새 함수면 훅의 effect 가 재실행되어 재연결된다 — 반드시 고정한다.
  const getToken = useMemo(
    () => (validSession ? createApiTokenProvider(sessionId) : notConfiguredProvider),
    [validSession, sessionId],
  )

  // roomName 은 서버 토큰에 이미 들어 있어 쓰이지 않는다(인자 자리만 채운다).
  // 가드가 통과하기 전에는 `enabled` 가 켜질 일이 없어 연결도 시작되지 않는다.
  const session = useLiveKitRoom(String(sessionId), getToken, {
    enabled: enabled && validSession && gate === 'open',
  })

  if (gate === null) {
    return (
      <DarkScope className="grid min-h-dvh place-items-center" aria-busy="true">
        <Spinner size={28} />
      </DarkScope>
    )
  }

  if (gate !== 'open') {
    return <Navigate to={gate.redirect} replace />
  }

  const context: SessionMediaContext = { session, connect, idle: !enabled }
  return <Outlet context={context} />
}

