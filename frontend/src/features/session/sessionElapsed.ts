import type { SessionDetail, SessionStatusSnapshot } from './types'

/**
 * 세션 경과 시간(`sessionElapsedMs`)의 기준점을 구한다.
 *
 * 이 값은 vision 이벤트마다 붙어 Aggregator 가 **두 참가자의 타임라인을 같은 축에 놓는 데**
 * 쓰인다. 참가자마다 어긋나면 같은 순간이 서로 다른 시각으로 기록된다.
 *
 * 그래서 **서버가 계산한 값만** 쓴다. 예전에는 `Date.now() - new Date(actualStartAt)` 였는데
 * 두 가지가 새어 들어왔다.
 *
 *  1. `actualStartAt` 은 백엔드 `LocalDateTime` 이라 **오프셋이 없다.** 오프셋 없는 date-time 을
 *     `new Date()` 에 넣으면 브라우저 로컬 타임존으로 해석되므로, KST 가 아닌 브라우저에서는
 *     시차만큼 통째로 어긋난다.
 *  2. `Date.now()` 는 **클라이언트** 벽시계, `actualStartAt` 은 **서버** 벽시계다. 시계가 안 맞는
 *     기기면 그 오차가 기준점에 그대로 실린다.
 *
 * `remainingSeconds` 와 `plannedDurationSec` 은 둘 다 서버가 계산해 내려주므로 이 둘을 빼면
 * 타임존 표기도, 클라이언트 시계 정확도도 필요 없어진다.
 */

/**
 * 백엔드 컨테이너 타임존(`TZ=Asia/Seoul`).
 * 오프셋 없이 오는 날짜를 해석할 때만 쓰는 **폴백 전용** 값이다.
 */
const SERVER_UTC_OFFSET = '+09:00'

/** 이미 `Z` 나 `±HH:MM` 이 붙어 있는지. 붙어 있으면 건드리면 안 된다(이중 오프셋). */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

/** `2026-08-06T15:08:01` 처럼 시각까지 있는 형태. 날짜만 있으면 기준점으로 쓸 수 없다. */
const HAS_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

/**
 * 서버가 준 날짜 문자열을 epoch ms 로. 해석할 수 없으면 `null`.
 *
 * 오프셋이 없으면 **서버 타임존을 명시해** 붙인다. 백엔드가 나중에 `OffsetDateTime` 으로
 * 바꿔도 이 함수는 그대로 동작한다 — 이미 오프셋이 있으면 손대지 않기 때문이다.
 */
export function parseServerDateTime(value: string | null | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!HAS_TIME.test(trimmed)) return null
  const normalized = HAS_OFFSET.test(trimmed)
    ? trimmed
    : `${trimmed.replace(' ', 'T')}${SERVER_UTC_OFFSET}`
  const ms = new Date(normalized).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * 세션 경과 시간(ms). 아직 알 수 없으면 `null` — 호출부는 분석을 시작하지 않는다.
 *
 * ⚠️ TODO(SESSION-TIME): 서버 계산 경로는 연장 시간을 반영하지 못한다.
 *    서버는 `remaining = planned + extension - elapsed` 로 계산하는데 `extensionDurationSec`
 *    이 응답에 없어서, 연장이 승인된 뒤에 이 함수를 처음 부르면 연장분만큼 적게 나온다.
 *    정상 경로에서는 닿지 않는다 — 기준점은 AI 워커가 붙는 세션 초반에 고정되고 연장은 종료
 *    5분 전에만 가능하다(`EXTENSION_WINDOW_MINUTES`). 노출되는 건 "연장 후 중간 새로고침"
 *    하나뿐이라, `extensionDurationSec` 노출을 백엔드에 요청해 둔 상태다.
 */
export function sessionElapsedSeedMs(
  status: SessionStatusSnapshot | null,
  detail: SessionDetail | null,
): number | null {
  const inProgress = (status?.status ?? detail?.status) === 'IN_PROGRESS'
  const plannedSec = detail?.plannedDurationSec ?? null
  const remainingSec = status?.remainingSeconds ?? detail?.remainingSeconds ?? null

  // remainingSeconds 는 서버에서 `max(0, …)` 로 **0 에 포화**한다. 0 이면 경과가 계획 시간인지
  // 그보다 더 지났는지 구분할 수 없으므로 이 경로를 쓰면 안 된다.
  if (inProgress && plannedSec !== null && remainingSec !== null && remainingSec > 0) {
    return Math.max(0, (plannedSec - remainingSec) * 1000)
  }

  // 폴백 — 서버 계산값이 없을 때만. 클라이언트 시계 오차가 남는다는 걸 알고 쓴다.
  const startedAtMs = parseServerDateTime(status?.actualStartAt ?? detail?.actualStartAt)
  if (startedAtMs === null) return null
  return Math.max(0, Date.now() - startedAtMs)
}
