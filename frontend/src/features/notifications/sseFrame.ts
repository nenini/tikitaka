/**
 * SSE 프레임 파싱. **의존성이 없는 순수 모듈**이다.
 *
 * 파싱이 틀리면 알림이 조용히 사라진다. 실행 중인 세션 없이 확인하려면 훅에서
 * 떼어내야 해서 파일을 나눴다.
 *
 * 서버 실제 출력(2026-08-04 확인) — 콜론 뒤에 **공백이 없다**.
 * ```
 * event:connected
 * retry:3000
 * data:{"userId":2,"connectedAt":"..."}
 *
 * :heartbeat
 * ```
 * 하트비트는 `:` 로 시작하는 주석이고, `retry:` 는 재접속 간격 힌트다.
 * 우리는 자체 백오프를 쓰므로 `retry` 는 무시한다.
 */

export interface SseFrame {
  event: string
  data: string
}

/** 프레임 하나에서 event 이름과 data 를 뽑는다. data 가 없으면 null. */
export function parseFrame(frame: string): SseFrame | null {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue // 주석(하트비트)
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }

  if (dataLines.length === 0) return null
  // 규격상 data 가 여러 줄이면 개행으로 이어 붙인다.
  return { event, data: dataLines.join('\n') }
}

/**
 * 버퍼에서 완성된 프레임만 잘라낸다.
 *
 * ⚠️ 마지막 조각은 **아직 덜 온 프레임**이므로 반드시 버퍼에 남겨야 한다.
 *    잘라 버리면 청크가 중간에서 끊길 때 알림 하나가 통째로 사라진다.
 */
export function drainFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  return { frames: parts, rest }
}
