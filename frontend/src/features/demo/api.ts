import {
  acceptMatch,
  cancelMatch,
  createMatchRequest,
  getCurrentMatch,
  leaveQueue,
} from '@/features/matching/api'
import { WEEKDAY_ORDER, buildSlots, isMatchClosed } from '@/features/matching/types'
import type { MatchPair } from '@/features/matching/types'

/**
 * 시연용 매칭 자동 주행 (MVP 데모 전용).
 *
 * 매칭 **화면**(W-08b 트랙 선택 · W-09b 대기 큐 · W-09 매칭 카드)을 건너뛰고
 * 그 화면들이 부르는 **실제 API 를 그대로** 순서대로 호출한다. 즉 세션·LiveKit·AI 는
 * 전부 진짜다 — 가짜 응답이나 목(mock)은 하나도 쓰지 않는다.
 *
 * ⚠️ 서버 게이트 때문에 "지금 당장" 세션이 잡히려면 두 가지가 맞아야 한다.
 *  1. `matching_policies` 의 minimumAcceptanceWindowMinutes + minimumPreparationMinutes 합만큼
 *     세션이 미래로 밀린다(기본 60+60=120분). 시연 전에 admin API 로 낮춰야 한다.
 *  2. `MatchAvailabilityPolicy` 는 30분 세션이 슬롯 **안에 통째로** 들어가야 배정한다.
 *     그래서 아래 슬롯은 매일 00:00~23:59 로 최대한 넓게 잡는다.
 *     (그럼에도 자정 30분 전이면 다음 날로 밀린다 — 슬롯을 넘길 수 없기 때문이다)
 */

/** 조건을 최대한 넓혀 후보 탈락을 막는다. 시연은 "붙는 것"이 목적이다. */
const DEMO_AGE_MIN = 19
const DEMO_AGE_MAX = 99

/** 매칭 성립·상대 수락 폴링 주기. */
const POLL_MS = 1_500
/** 폴링 상한. 이보다 오래 걸리면 상대가 아직 안 들어온 것으로 본다. */
const POLL_TIMEOUT_MS = 60_000

export type DemoStep =
  | 'idle'
  | 'resetting'
  | 'enqueuing'
  | 'waiting-match'
  | 'accepting'
  | 'waiting-partner'
  | 'ready'

export const DEMO_STEP_TEXT: Record<DemoStep, string> = {
  idle: '대기 중',
  resetting: '이전 매칭·큐 정리 중…',
  enqueuing: '매칭 큐에 등록 중…',
  'waiting-match': '상대를 기다리는 중… (다른 기기에서도 시작 버튼을 눌러주세요)',
  accepting: '매칭 수락 중…',
  'waiting-partner': '상대 수락을 기다리는 중…',
  ready: '대기방 준비 완료',
}

/**
 * 진행 중이던 매칭·큐를 전부 비운다.
 *
 * 시연을 반복하면 직전 매칭이 CONFIRMED 로 남아 새 큐 등록이 막힌다
 * (`createMatch` 가 활성 페어를 보고 후보에서 제외한다). 그래서 매번 먼저 정리한다.
 * 정리 대상이 없을 때의 404 는 정상이므로 삼킨다.
 */
export async function resetMyMatching(): Promise<void> {
  const current = await getCurrentMatch().catch(() => null)
  if (current && !isMatchClosed(current.status)) {
    await cancelMatch(current.matchPairId, '시연 초기화').catch(() => {
      /* 이미 취소됐거나 취소할 수 없는 상태 — 다음 단계에서 드러난다 */
    })
  }
  await leaveQueue('시연 초기화').catch(() => {
    /* 큐에 없으면 404 — 정상 */
  })
}

/** 조건을 넓게 열어 큐에 등록한다. */
export async function enqueueForDemo(): Promise<void> {
  await createMatchRequest({
    preferredAgeMin: DEMO_AGE_MIN,
    preferredAgeMax: DEMO_AGE_MAX,
    availableSlots: buildSlots(WEEKDAY_ORDER, '00:00', '23:59'),
  })
}

/** 폴링 공통 — `predicate` 가 참인 매칭을 얻거나 시간이 다 되면 null. */
async function pollMatch(
  predicate: (pair: MatchPair) => boolean,
  signal: AbortSignal,
): Promise<MatchPair | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal.aborted) return null
    const pair = await getCurrentMatch().catch(() => null)
    if (pair && predicate(pair)) return pair
    await sleep(POLL_MS, signal)
  }
  return null
}

/** 매칭이 성립될 때까지 기다린다. */
export function waitForMatch(signal: AbortSignal): Promise<MatchPair | null> {
  return pollMatch((pair) => !isMatchClosed(pair.status), signal)
}

/**
 * 상대 수락까지 기다린다. 방(`sessionId`)은 **양쪽이 다 수락해야** 생기므로
 * `sessionId` 가 채워지는 것을 완료 신호로 쓴다.
 */
export function waitForPartnerAccept(signal: AbortSignal): Promise<MatchPair | null> {
  return pollMatch((pair) => pair.session.sessionId != null, signal)
}

export { acceptMatch, getCurrentMatch }

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}
