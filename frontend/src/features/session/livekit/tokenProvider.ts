// import { apiClient } from "@/shared/api/client";

export interface RoomCredentials {
    serverUrl: string
    token: string
}

export type TokenProvider = (roomName: string) =>
    Promise<RoomCredentials>

export const devTokenProvider: TokenProvider = async () => {
    const serverUrl = import.meta.env.VITE_LIVEKIT_URL
    const peer = new URLSearchParams(location.search).get('peer') ?? 'a'
    const token = import.meta.env[`VITE_LIVEKIT_TOKEN_${peer.toUpperCase()}`]

    if (!serverUrl || !token) {
        throw new Error(`LiveKit 개발 설정이 없습니다. .env.local에 VITE_LIVEKIT_URL 과 VITE_LIVEKIT_TOKEN_${peer.toUpperCase()} 를 넣어주세요.`)
    }

    return { serverUrl, token }
}

// 백엔드 api 준비 시 교체
// export const apiTokenProvider: TokenProvider = async (roomname) => {
//     const { data } = await apiClient.post<RoomCredentials>(`/sessions/livekit-token`, { roomname })
//     return data
// }