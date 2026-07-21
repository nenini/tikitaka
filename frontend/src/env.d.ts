/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST API 베이스 URL (미설정 시 vite proxy 의 /api 사용) */
  readonly VITE_API_BASE_URL?: string
  /** WebSocket(STOMP) 엔드포인트 */
  readonly VITE_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
