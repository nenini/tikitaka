import { create } from 'zustand'

export type CoachTone = 'positive' | 'negative' | 'neutral'

/** 서버 `CoachingPriority`. 코칭이 겹칠 때 무엇을 먼저 보여줄지 정하는 기준이다. */
export type CoachPriority = 'LOW' | 'MEDIUM' | 'HIGH'

/** 본인 화면에만 표시되는 실시간 코칭 메시지 (COACH-01/02/04, 상대에게 미표시) */
export interface CoachMessage {
  id: string
  tone: CoachTone
  text: string
  /** 도착 시각(ms). 같은 우선순위끼리는 먼저 온 것을 먼저 보여준다. */
  at: number
  priority: CoachPriority
  /** 표시 유효 시간(ms). `CoachToast` 의 자동 사라짐에 그대로 넘긴다. */
  ttlMs: number
  /** 만료 시각(ms) = `at + ttlMs`. */
  expiresAt: number
}

/** 사용자 선택 개입 강도 (COACH-04) */
export type CoachIntensity = 'flow' | 'balanced' | 'active'

/** 서버가 만료 정보를 주지 않았을 때 쓰는 표시 시간. */
const DEFAULT_TTL_MS = 8_000

const PRIORITY_RANK: Readonly<Record<CoachPriority, number>> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

/** `pushMessage` 입력. 식별자·만료는 스토어가 채운다. */
export interface CoachMessageInput {
  tone: CoachTone
  text: string
  priority?: CoachPriority
  /**
   * 서버가 준 세션 경과 기준 시각(ms).
   *
   * ⚠️ **차이만 쓴다.** `expiresAtSessionElapsedMs` 를 절대 시각으로 환산하려면
   *    클라이언트가 세션 경과 시간을 서버와 똑같이 알아야 하는데, 그 값은 시계 오차와
   *    연장 처리에 흔들린다. 두 값의 **차이(= 표시 유효 시간)** 만 쓰면 오차가 개입하지
   *    않고 도착 시각부터 세면 된다.
   */
  triggeredAtSessionElapsedMs?: number
  expiresAtSessionElapsedMs?: number
}

interface CoachingState {
  intensity: CoachIntensity
  /** 도착 순서대로 쌓인 큐. 만료되거나 사용자가 닫아야 빠진다. */
  messages: CoachMessage[]
  pushMessage: (msg: CoachMessageInput) => void
  /** 사용자가 닫은 카드를 큐에서 뺀다 — 뒤에 대기하던 카드가 올라온다. */
  dismiss: (id: string) => void
  /** 만료된 카드를 걷어낸다. 세션 화면이 1초 주기로 부른다. */
  pruneExpired: (now?: number) => void
  clear: () => void
  setIntensity: (intensity: CoachIntensity) => void
}

/** 서버가 준 두 시각에서 표시 유효 시간을 뽑는다. 이상값이면 기본값으로 떨어진다. */
function resolveTtlMs(input: CoachMessageInput): number {
  const from = input.triggeredAtSessionElapsedMs
  const to = input.expiresAtSessionElapsedMs
  if (typeof from !== 'number' || typeof to !== 'number') return DEFAULT_TTL_MS
  const span = to - from
  // 0 이하는 서버 계산 오류이거나 이미 지난 코칭이다. 그래도 기본 시간만큼은 보여준다
  // — 떴다가 즉시 사라져 깜빡이는 편이 안 뜨는 것보다 나쁘다.
  return span > 0 ? span : DEFAULT_TTL_MS
}

/**
 * 실시간 코칭 오버레이 상태. (FE-A 영역)
 * MediaPipe/STT 원시 지표가 아니라, "화면에 띄울 코칭 카드" 만 담는다.
 *
 * 화면에는 **한 번에 하나만** 뜬다(원칙 2). 그렇다고 뒤에 온 코칭을 버리지는 않는다 —
 * 큐에 쌓아두고 `selectVisibleMessage` 로 하나만 골라 그린다.
 */
export const useCoachingStore = create<CoachingState>((set) => ({
  intensity: 'balanced',
  messages: [],

  pushMessage: (msg) =>
    set((s) => {
      const at = Date.now()
      const ttlMs = resolveTtlMs(msg)
      const next: CoachMessage = {
        id: crypto.randomUUID(),
        tone: msg.tone,
        text: msg.text,
        at,
        priority: msg.priority ?? 'MEDIUM',
        ttlMs,
        expiresAt: at + ttlMs,
      }
      // 넣는 김에 만료된 것도 함께 치운다 — 큐가 조용히 길어지지 않게.
      return { messages: [...s.messages.filter((m) => m.expiresAt > at), next].slice(-20) }
    }),

  dismiss: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

  pruneExpired: (now = Date.now()) =>
    set((s) => {
      const kept = s.messages.filter((m) => m.expiresAt > now)
      // 배열 참조가 바뀌면 구독자가 전부 다시 그린다. 실제로 줄었을 때만 교체한다.
      return kept.length === s.messages.length ? s : { messages: kept }
    }),

  clear: () => set({ messages: [] }),
  setIntensity: (intensity) => set({ intensity }),
}))

/**
 * 지금 띄울 카드 하나를 고른다. **순수 함수** — 스토어 없이 입력·출력만으로 확인할 수 있다.
 *
 * 규칙: 만료되지 않은 것 중 우선순위가 높은 것, 같으면 **먼저 온 것**.
 * 나중 것을 먼저 보여주면 대기하던 카드가 계속 밀려 영영 안 뜬다.
 */
export function selectVisibleMessage(
  messages: readonly CoachMessage[],
  now: number = Date.now(),
): CoachMessage | null {
  let best: CoachMessage | null = null
  for (const message of messages) {
    if (message.expiresAt <= now) continue
    if (best == null) {
      best = message
      continue
    }
    const rank = PRIORITY_RANK[message.priority]
    const bestRank = PRIORITY_RANK[best.priority]
    if (rank > bestRank || (rank === bestRank && message.at < best.at)) best = message
  }
  return best
}

/** 뒤에서 기다리는 카드 수. 화면이 "+N" 으로 알려 준다. */
export function countPendingMessages(
  messages: readonly CoachMessage[],
  now: number = Date.now(),
): number {
  const alive = messages.reduce((count, m) => (m.expiresAt > now ? count + 1 : count), 0)
  return Math.max(0, alive - 1)
}
