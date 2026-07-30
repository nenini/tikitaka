import { tokenStore } from '@/shared/api/tokens'

/**
 * 최소 STOMP 1.2 클라이언트 (native WebSocket 기반).
 *
 * 백엔드 계약 (SSOT: `global/config/WebSocketConfig.java`, `room/config/RoomStompAuthInterceptor.java`)
 *  - 엔드포인트: `/ws` — **SockJS 아님**(`addEndpoint("/ws")` 에 `.withSockJS()` 가 없다) → raw WebSocket
 *  - 브로커 프리픽스: `/topic`, `/queue` · 앱 프리픽스: `/app` · user 프리픽스: `/user`
 *  - 인증: **CONNECT 프레임의 `Authorization` 네이티브 헤더**로 `Bearer <accessToken>`.
 *    브라우저는 WebSocket 핸드셰이크에 HTTP 헤더를 붙일 수 없으므로 반드시 프레임 헤더로 보낸다.
 *  - 구독 권한: 인터셉터가 화이트리스트에 없는 destination 을 전부 거절한다 →
 *    허용 목록은 `SESSION_TOPICS`(아래 sessionSocket.ts) 참고.
 *
 * ⚠️ `@stomp/stompjs` 를 쓰지 않는 이유: 의존성 추가 없이 지금 바로 동작시키기 위함.
 *    필요한 기능(CONNECT/SUBSCRIBE/SEND/heartbeat/재연결)만 담았다. 나중에 라이브러리로
 *    교체하려면 이 파일만 갈아끼우면 된다 — 외부로 나가는 API 는 `StompConnection` 뿐이다.
 */

const NULL = '\u0000'
/** 심장박동 주기(ms). 서버 SimpleBroker 기본값과 맞춘다. */
const HEARTBEAT_MS = 10_000
/** 재연결 백오프 (ms). 마지막 값에서 더 늘리지 않는다. */
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000]

export type StompMessageHandler = (body: unknown, headers: Record<string, string>) => void

export interface StompConnection {
  /** destination 구독. 반환값을 호출하면 구독 해제. */
  subscribe(destination: string, handler: StompMessageHandler): () => void
  /** `/app/...` 으로 메시지 전송. 미연결이면 조용히 버린다(재전송하지 않는다). */
  send(destination: string, body: unknown): void
  /** 연결 상태 변화 구독. 반환값을 호출하면 해제. */
  onStateChange(handler: (state: StompState) => void): () => void
  readonly state: StompState
  /** 이 연결의 사용자를 하나 줄인다. 0 이 되면 소켓을 닫는다. */
  release(): void
}

export type StompState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed'

/** STOMP 서버 URL. `VITE_WS_URL` 이 없으면 현재 origin 의 `/ws` 를 쓴다(vite proxy 경유). */
function resolveUrl(): string {
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return configured
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/ws`
}

/* ── 프레임 직렬화 / 파싱 ─────────────────────────────── */

/** STOMP 1.2 헤더 값 이스케이프. */
function escapeHeader(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/:/g, '\\c')
}

function unescapeHeader(value: string): string {
  return value.replace(/\\c/g, ':').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\')
}

function buildFrame(command: string, headers: Record<string, string>, body = ''): string {
  const lines = [command]
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`${escapeHeader(key)}:${escapeHeader(value)}`)
  }
  return `${lines.join('\n')}\n\n${body}${NULL}`
}

interface ParsedFrame {
  command: string
  headers: Record<string, string>
  body: string
}

function parseFrame(raw: string): ParsedFrame | null {
  // 심장박동(개행만 있는 프레임)은 무시한다.
  if (raw.trim() === '') return null

  const separator = raw.indexOf('\n\n')
  const head = separator === -1 ? raw : raw.slice(0, separator)
  const body = separator === -1 ? '' : raw.slice(separator + 2)

  const [command, ...headerLines] = head.split('\n')
  const headers: Record<string, string> = {}
  for (const line of headerLines) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = unescapeHeader(line.slice(0, colon))
    // 중복 헤더는 STOMP 규약상 첫 값이 유효하다.
    if (!(key in headers)) headers[key] = unescapeHeader(line.slice(colon + 1))
  }
  return { command: command.trim(), headers, body }
}

/* ── 연결 구현 ────────────────────────────────────────── */

interface Subscription {
  id: string
  destination: string
  handler: StompMessageHandler
}

class StompSocket {
  private ws: WebSocket | null = null
  private readonly subscriptions = new Map<string, Subscription>()
  private readonly stateHandlers = new Set<(state: StompState) => void>()
  private subscriptionSeq = 0
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private closedByUs = false
  private buffer = ''

  state: StompState = 'idle'
  refCount = 0

  private setState(next: StompState) {
    if (this.state === next) return
    this.state = next
    this.stateHandlers.forEach((handler) => handler(next))
  }

  onStateChange(handler: (state: StompState) => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  open() {
    if (this.ws || this.closedByUs) return
    const token = tokenStore.getAccess()
    if (!token) {
      // 토큰이 없으면 인터셉터가 CONNECT 를 거절한다 — 아예 열지 않는다.
      this.setState('closed')
      return
    }

    this.setState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting')

    const ws = new WebSocket(resolveUrl())
    this.ws = ws

    ws.onopen = () => {
      this.buffer = ''
      ws.send(
        buildFrame('CONNECT', {
          'accept-version': '1.2',
          host: location.hostname,
          'heart-beat': `${HEARTBEAT_MS},${HEARTBEAT_MS}`,
          Authorization: `Bearer ${token}`,
        }),
      )
    }

    ws.onmessage = (event) => this.handleData(String(event.data))

    ws.onerror = () => {
      // onclose 가 이어서 호출되므로 재연결은 거기서만 처리한다.
    }

    ws.onclose = () => {
      this.stopHeartbeat()
      this.ws = null
      if (this.closedByUs || this.refCount === 0) {
        this.setState('closed')
        return
      }
      this.scheduleReconnect()
    }
  }

  private handleData(chunk: string) {
    this.buffer += chunk
    // 프레임 구분자는 NULL 바이트다. JSON 본문에는 NULL 이 들어오지 않으므로 단순 분할로 충분하다.
    let boundary = this.buffer.indexOf(NULL)
    while (boundary !== -1) {
      const raw = this.buffer.slice(0, boundary)
      this.buffer = this.buffer.slice(boundary + 1)
      const frame = parseFrame(raw)
      if (frame) this.handleFrame(frame)
      boundary = this.buffer.indexOf(NULL)
    }
  }

  private handleFrame(frame: ParsedFrame) {
    switch (frame.command) {
      case 'CONNECTED': {
        this.reconnectAttempt = 0
        this.setState('connected')
        this.startHeartbeat(frame.headers['heart-beat'])
        // 재연결이면 기존 구독을 모두 복구한다.
        this.subscriptions.forEach((sub) => this.sendSubscribe(sub))
        break
      }
      case 'MESSAGE': {
        const sub = this.subscriptions.get(frame.headers.subscription)
        if (!sub) return
        sub.handler(safeJson(frame.body), frame.headers)
        break
      }
      case 'ERROR': {
        // 인터셉터가 구독/전송을 거절하면 서버가 ERROR 를 보내고 연결을 끊는다.
        console.error('[stomp] ERROR frame:', frame.headers.message ?? frame.body)
        break
      }
      default:
        break
    }
  }

  private startHeartbeat(negotiated: string | undefined) {
    this.stopHeartbeat()
    // 서버가 보낸 `heart-beat: <server-send>,<server-want>` 중 뒤쪽이 "클라가 보내주길 원하는 주기".
    const wanted = Number(negotiated?.split(',')[1] ?? 0)
    if (!wanted) return
    const interval = Math.max(wanted, 1_000)
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('\n')
    }, interval)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return
    const delay = RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)]
    this.reconnectAttempt += 1
    this.setState('reconnecting')
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private sendSubscribe(sub: Subscription) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(buildFrame('SUBSCRIBE', { id: sub.id, destination: sub.destination, ack: 'auto' }))
  }

  subscribe(destination: string, handler: StompMessageHandler): () => void {
    const id = `sub-${(this.subscriptionSeq += 1)}`
    const sub: Subscription = { id, destination, handler }
    this.subscriptions.set(id, sub)
    if (this.state === 'connected') this.sendSubscribe(sub)

    return () => {
      this.subscriptions.delete(id)
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(buildFrame('UNSUBSCRIBE', { id }))
      }
    }
  }

  send(destination: string, body: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN || this.state !== 'connected') return
    const payload = JSON.stringify(body)
    this.ws.send(
      buildFrame(
        'SEND',
        {
          destination,
          'content-type': 'application/json;charset=utf-8',
          // content-length 는 **바이트 수**다. 한글이 섞이면 문자 수와 다르다.
          'content-length': String(new TextEncoder().encode(payload).length),
        },
        payload,
      ),
    )
  }

  close() {
    this.closedByUs = true
    this.stopHeartbeat()
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buildFrame('DISCONNECT', {}))
    }
    this.ws?.close()
    this.ws = null
    this.subscriptions.clear()
    this.setState('closed')
  }
}

function safeJson(body: string): unknown {
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

/* ── 공유 연결 (참조 카운팅) ───────────────────────────── */

let shared: StompSocket | null = null

/**
 * 앱 전체가 공유하는 STOMP 연결을 얻는다.
 *
 * 세션 화면에서 타이머·참가자·코칭·침묵·안전 경고를 각각 구독하는데, 소켓을 여러 개 열면
 * 서버 인증·심장박동이 그만큼 늘어난다. 참조 카운팅으로 하나만 유지한다 —
 * 마지막 사용자가 `release()` 하면 닫힌다.
 */
export function acquireStomp(): StompConnection {
  if (!shared || shared.state === 'closed') {
    shared = new StompSocket()
  }
  const socket = shared
  socket.refCount += 1
  socket.open()

  let released = false
  return {
    subscribe: (destination, handler) => socket.subscribe(destination, handler),
    send: (destination, body) => socket.send(destination, body),
    onStateChange: (handler) => socket.onStateChange(handler),
    get state() {
      return socket.state
    },
    release: () => {
      if (released) return
      released = true
      socket.refCount -= 1
      if (socket.refCount <= 0) {
        socket.close()
        if (shared === socket) shared = null
      }
    },
  }
}
