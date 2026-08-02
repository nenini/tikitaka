import { joinSession } from '../api'

export interface RoomCredentials {
    serverUrl: string
    token: string
}

export type TokenProvider = (roomName: string) =>
    Promise<RoomCredentials>

/**
 * 실서버 토큰 발급.
 *
 * ⚠️ `POST /sessions/livekit-token` 같은 전용 엔드포인트는 **없다**.
 *    입장(`POST /api/v1/sessions/{id}/join`) 응답의 `liveKitUrl` / `liveKitAccessToken` 이 접속 정보다
 *    (SSOT: `SessionJoinResponse`). join 은 멱등이라(`alreadyJoined`) 재연결 때 다시 불러도 안전하다.
 *
 * 💡 접속할 LiveKit Room 이름은 **토큰 안에 들어 있다**(서버의 `WaitingRoom.livekitRoomName` 기준).
 *    그래서 `roomName` 인자는 쓰지 않는다 — 클라이언트가 방 이름을 정하지 않는다.
 */
export function createApiTokenProvider(sessionId: number): TokenProvider {
    return async () => {
        const joined = await joinSession(sessionId)
        if (!joined.liveKitConfigured || !joined.liveKitUrl || !joined.liveKitAccessToken) {
            throw new Error('서버에 화상 연결 설정이 준비되지 않았어요. 잠시 후 다시 시도해 주세요.')
        }
        return { serverUrl: toWebSocketUrl(joined.liveKitUrl), token: joined.liveKitAccessToken }
    }
}

/**
 * `http(s)://` → `ws(s)://` 정규화.
 *
 * ⚠️ 백엔드가 클라이언트에 **서버 API URL 을 그대로** 내려준다 —
 *    `LiveKitParticipantTokenIssuer` 가 `properties.url()`(http) 을 쓰고,
 *    ws 로 바꿔주는 `properties.clientUrl()` 은 호출되지 않는다.
 *    LiveKit 클라이언트는 ws 스킴을 기대하므로 여기서 바꿔준다.
 *    (백엔드가 `clientUrl()` 로 고치면 이 함수는 그대로 통과시키기만 한다)
 */
function toWebSocketUrl(url: string): string {
    if (/^https:\/\//i.test(url)) return `wss://${url.slice(8)}`
    if (/^http:\/\//i.test(url)) return `ws://${url.slice(7)}`
    return url
}

/**
 * 개발용 토큰 — `.env.local` 의 고정 토큰으로 붙는다.
 * 백엔드 없이 두 탭을 붙여볼 때만 쓴다(`/livekit-demo`).
 */
export const devTokenProvider: TokenProvider = async () => {
    const serverUrl = import.meta.env.VITE_LIVEKIT_URL
    const peer = new URLSearchParams(location.search).get('peer') ?? 'a'
    const token = import.meta.env[`VITE_LIVEKIT_TOKEN_${peer.toUpperCase()}`]

    if (!serverUrl || !token) {
        throw new Error(`LiveKit 개발 설정이 없습니다. .env.local에 VITE_LIVEKIT_URL 과 VITE_LIVEKIT_TOKEN_${peer.toUpperCase()} 를 넣어주세요.`)
    }

    return { serverUrl, token }
}
