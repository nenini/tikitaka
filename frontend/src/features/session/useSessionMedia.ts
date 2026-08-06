import { useOutletContext } from 'react-router-dom'
import type { LiveKitSession } from './livekit/useLiveKitRoom'

/**
 * 대기방·세션이 공유하는 LiveKit 연결. 소유자는 `SessionMediaLayout` 이다.
 *
 * 훅만 있는 파일로 분리한 것은 컴포넌트와 같은 파일에 두면 fast-refresh 린트 규칙
 * (`react/only-export-components`)에 걸리기 때문이다.
 */
export interface SessionMediaContext {
  session: LiveKitSession
  /**
   * 연결을 시작한다. **멱등** — 여러 번 불러도 한 번만 붙는다.
   *
   * 서버가 `READY`/`IN_PROGRESS` 에서만 join 을 받으므로(`validateJoinable`),
   * 대기방은 양측 준비가 끝난 뒤에 부르고 세션 화면은 마운트 시 부른다.
   */
  connect: () => void
  /** 아직 연결을 시작하지 않았는가 */
  idle: boolean
}

export function useSessionMedia(): SessionMediaContext {
  return useOutletContext<SessionMediaContext>()
}
