import { useCallback, useMemo, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
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

export function SessionMediaLayout() {
  const { sessionId: sessionIdParam } = useParams()
  const sessionId = Number(sessionIdParam)
  const validSession = Number.isFinite(sessionId) && sessionId > 0

  // 한 번 켜지면 되돌리지 않는다 — 대기방에서 붙인 연결을 세션이 그대로 물려받는다.
  const [enabled, setEnabled] = useState(false)
  const connect = useCallback(() => setEnabled(true), [])

  // getToken 이 매 렌더 새 함수면 훅의 effect 가 재실행되어 재연결된다 — 반드시 고정한다.
  const getToken = useMemo(
    () => (validSession ? createApiTokenProvider(sessionId) : notConfiguredProvider),
    [validSession, sessionId],
  )

  // roomName 은 서버 토큰에 이미 들어 있어 쓰이지 않는다(인자 자리만 채운다).
  const session = useLiveKitRoom(String(sessionId), getToken, {
    enabled: enabled && validSession,
  })

  const context: SessionMediaContext = { session, connect, idle: !enabled }
  return <Outlet context={context} />
}

