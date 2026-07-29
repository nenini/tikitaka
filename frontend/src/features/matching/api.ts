import { apiClient } from '@/shared/api/client'
import type {
  MatchConditions,
  MatchPair,
  MatchRequest,
  QueueStatus,
} from './types'

/**
 * 매칭 REST. 백엔드 미가동 시 데모/오프라인 폴백을 돌려준다(대기방과 동일한 방침).
 * 실서버가 준비되면 폴백은 자동으로 안 쓰인다.
 *
 *   POST   /api/match/requests            — 실사용자 큐 등록
 *   GET    /api/match/requests/{id}       — 대기 상태·순번
 *   PATCH  /api/match/requests/{id}       — 조건 완화
 *   DELETE /api/match/requests/{id}       — 큐 이탈
 *   GET    /api/match/pairs/{id}          — 매칭 카드
 *   POST   /api/match/pairs/{id}/responses{ response }
 */

/** 실사용자 큐 등록. 서버는 WAITING 중복(동시 1개)을 거부할 수 있다. */
export async function createRealMatchRequest(): Promise<MatchRequest> {
  try {
    const { data } = await apiClient.post<MatchRequest>('/match/requests', { track: 'REAL' })
    return data
  } catch {
    return {
      matchRequestId: `demo-${Date.now()}`,
      status: 'WAITING',
      requestedAt: new Date().toISOString(),
    }
  }
}

const DEMO_CONDITIONS: MatchConditions = {
  minPreferredAge: 26,
  maxPreferredAge: 33,
  availableSlotCount: 5,
  preferredStartAt: todayAt(18),
  preferredEndAt: todayAt(21),
  blockedCount: 2,
}

export async function getQueueStatus(requestId: string): Promise<QueueStatus> {
  try {
    const { data } = await apiClient.get<QueueStatus>(`/match/requests/${requestId}`)
    return data
  } catch {
    return {
      matchRequestId: requestId,
      status: 'WAITING',
      position: 3,
      requestedAt: new Date(Date.now() - 4 * 60_000 - 12_000).toISOString(),
      conditions: DEMO_CONDITIONS,
      delayReason: 'SLOT_NARROW',
      matchedPairId: null,
    }
  }
}

/** 조건 완화 — 연령 범위/희망 시작 등 일부만 patch. */
export async function relaxConditions(
  requestId: string,
  patch: Partial<Pick<MatchConditions, 'minPreferredAge' | 'maxPreferredAge' | 'preferredStartAt' | 'preferredEndAt'>>,
): Promise<QueueStatus> {
  try {
    const { data } = await apiClient.patch<QueueStatus>(`/match/requests/${requestId}`, patch)
    return data
  } catch {
    const base = await getQueueStatus(requestId)
    return { ...base, conditions: { ...base.conditions, ...patch }, delayReason: null }
  }
}

/** 큐 이탈(DELETE) — 패널티·온도 감점 없음. */
export async function leaveQueue(requestId: string): Promise<void> {
  try {
    await apiClient.delete(`/match/requests/${requestId}`)
  } catch {
    /* 데모: 서버 없이도 이탈 처리로 간주 */
  }
}

export async function getMatchPair(pairId: string): Promise<MatchPair> {
  try {
    const { data } = await apiClient.get<MatchPair>(`/match/pairs/${pairId}`)
    return data
  } catch {
    return {
      matchPairId: pairId,
      status: 'PROPOSED',
      acceptDeadlineAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      opponent: { nickname: '유월', ageBand: '20대 후반', faceTag: '🐰 토끼상' },
      session: {
        sessionId: 'demo',
        scheduledStartAt: todayAt(19),
        plannedDurationMin: 30,
        themeName: '저녁 식당',
        themeEmoji: '🍽',
        myPracticeGoal: '발화량 줄이기',
      },
      opponentAccepted: true,
      myResponse: null,
    }
  }
}

/** 수락/거절. 성공 시 확정 상태를 돌려준다(데모는 즉시 CONFIRMED/REJECTED로 낙관 갱신). */
export async function respondToPair(
  pairId: string,
  response: 'ACCEPTED' | 'REJECTED',
): Promise<MatchPair> {
  try {
    const { data } = await apiClient.post<MatchPair>(`/match/pairs/${pairId}/responses`, { response })
    return data
  } catch {
    const base = await getMatchPair(pairId)
    return {
      ...base,
      myResponse: response,
      status: response === 'ACCEPTED' ? (base.opponentAccepted ? 'CONFIRMED' : 'ACCEPTED') : 'REJECTED',
    }
  }
}

/** 오늘 HH:00 ISO. */
function todayAt(hour: number): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
