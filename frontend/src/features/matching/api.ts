import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap } from '@/shared/api/envelope'
import type { ApiEnvelope } from '@/shared/api/envelope'
import { serverDateTimeToIso, serverDateTimeToIsoRequired } from '@/shared/api/datetime'
import { getMyPracticeGoal } from '@/shared/api/me'
import { themeForHour } from '@/features/room/api'
import { toAgeBand } from './types'
import type {
  MatchPair,
  MatchRequestInput,
  QueueStatus,
  RawMatchRequest,
  RawMatchResult,
} from './types'

/**
 * 매칭 REST.
 *
 * 백엔드 SSOT — 스펙 문서(api명세_0728.csv)와 다르므로 **구현 코드** 기준으로 맞췄다.
 *
 *   POST   /api/v1/match-requests              큐 등록          (MatchRequestSaveRequest)
 *   GET    /api/v1/match-requests/me/current   내 대기 요청
 *   PUT    /api/v1/match-requests/me/current   조건 변경(전체 교체)
 *   DELETE /api/v1/match-requests/me/current   큐 이탈           (선택 바디 { reason })
 *   GET    /api/v1/matches/me/current          내 현재 매칭 결과
 *   POST   /api/v1/matches/{matchPairId}/accept
 *   POST   /api/v1/matches/{matchPairId}/reject
 *   DELETE /api/v1/matches/{matchPairId}       확정 매칭 취소     (선택 바디 { reason })
 *
 * ⚠️ 백엔드는 **요청 id 로 조회하는 엔드포인트를 제공하지 않는다** — `me/current` 단건뿐이다.
 *    그래서 라우트의 `:requestId`/`:pairId` 는 화면 복구용 힌트로만 쓰고, 조회는 항상 me/current 로 한다.
 * ⚠️ 데모 폴백을 전부 제거했다. 예전 폴백은 서버 오류를 삼켜서 "동작하는 것처럼" 보이게 만들었다 —
 *    지금은 오류를 그대로 올려 화면이 원인을 말하게 한다.
 */

/* ── 큐(매칭 요청) ─────────────────────────────────────── */

/** 큐 등록. 온보딩(프로필·설문·얼굴상)이 끝나지 않았으면 서버가 409 로 막는다. */
export async function createMatchRequest(input: MatchRequestInput): Promise<QueueStatus> {
  const raw = unwrap(await apiClient.post<ApiEnvelope<RawMatchRequest>>('/v1/match-requests', input))
  return toQueueStatus(raw)
}

/** 내 대기 중인 요청. 없으면 null(서버는 404 `MATCH_REQUEST_NOT_FOUND`). */
export async function getCurrentMatchRequest(): Promise<QueueStatus | null> {
  try {
    const raw = unwrap(
      await apiClient.get<ApiEnvelope<RawMatchRequest>>('/v1/match-requests/me/current'),
    )
    return toQueueStatus(raw)
  } catch (error) {
    if (errorCodeOf(error) === 'MATCH_REQUEST_NOT_FOUND') return null
    throw error
  }
}

/**
 * 조건 변경(= 조건 완화).
 * ⚠️ PUT 은 전체 교체다 — 나이만 바꿔도 슬롯을 함께 보내야 한다.
 */
export async function updateMatchRequest(input: MatchRequestInput): Promise<QueueStatus> {
  const raw = unwrap(
    await apiClient.put<ApiEnvelope<RawMatchRequest>>('/v1/match-requests/me/current', input),
  )
  return toQueueStatus(raw)
}

/** 큐 이탈 — 패널티·온도 감점 없음. */
export async function leaveQueue(reason?: string): Promise<void> {
  await apiClient.delete('/v1/match-requests/me/current', {
    data: reason ? { reason } : undefined,
  })
}

/* ── 매칭 결과(페어) ───────────────────────────────────── */

/**
 * 내 현재 매칭. 없으면 null(서버는 404 `MATCH_NOT_FOUND`).
 * 내 개선 목표는 매칭 응답에 없어서 설문에서 함께 읽어 채운다.
 */
export async function getCurrentMatch(): Promise<MatchPair | null> {
  const [result, practiceGoal] = await Promise.all([
    apiClient
      .get<ApiEnvelope<RawMatchResult>>('/v1/matches/me/current')
      .then(unwrap)
      .catch((error: unknown) => {
        if (errorCodeOf(error) === 'MATCH_NOT_FOUND') return null
        throw error
      }),
    // 목표를 못 읽어도 매칭 카드는 떠야 한다.
    getMyPracticeGoal().catch(() => null),
  ])
  return result ? toMatchPair(result, practiceGoal) : null
}

export async function acceptMatch(
  matchPairId: number,
  practiceGoal?: string | null,
): Promise<MatchPair> {
  const raw = unwrap(
    await apiClient.post<ApiEnvelope<RawMatchResult>>(`/v1/matches/${matchPairId}/accept`),
  )
  return toMatchPair(raw, practiceGoal ?? null)
}

export async function rejectMatch(
  matchPairId: number,
  practiceGoal?: string | null,
): Promise<MatchPair> {
  const raw = unwrap(
    await apiClient.post<ApiEnvelope<RawMatchResult>>(`/v1/matches/${matchPairId}/reject`),
  )
  return toMatchPair(raw, practiceGoal ?? null)
}

/**
 * 확정된 매칭 취소. 세션 1시간 이내면 서버가 `lateCancellation` 으로 표시하고 노쇼를 부과한다.
 * (전용 화면은 아직 없다 — 매칭 카드/대기방에서 호출할 수 있게 열어둔다)
 */
export async function cancelMatch(matchPairId: number, reason?: string): Promise<void> {
  await apiClient.delete(`/v1/matches/${matchPairId}`, {
    data: reason ? { reason } : undefined,
  })
}

/* ── 매핑 ──────────────────────────────────────────────── */

function toQueueStatus(raw: RawMatchRequest): QueueStatus {
  return {
    matchRequestId: raw.matchRequestId,
    status: raw.status,
    requestedAt: serverDateTimeToIsoRequired(raw.waitingStartedAt ?? raw.requestedAt),
    conditions: {
      preferredAgeMin: raw.preferredAgeMin,
      preferredAgeMax: raw.preferredAgeMax,
      availableSlots: raw.availableSlots ?? [],
      preferredFaceTag: raw.preferredFaceTag,
      preferredTraits: raw.preferredTraits ?? [],
    },
    matched: raw.status !== 'WAITING' && raw.status !== 'CANCELLED' && raw.status !== 'EXPIRED',
    // 서버가 지연 사유를 제공하지 않는다 — 화면의 안내 Callout 은 렌더되지 않는다.
    delayReason: null,
  }
}

function toMatchPair(raw: RawMatchResult, practiceGoal: string | null): MatchPair {
  const scheduledIso = serverDateTimeToIso(raw.scheduledAt ?? raw.proposedScheduledAt)
  // 테마는 서버가 배정하지 않는다(room_themes 응답 없음) → 예정 시각의 "시"로 클라이언트가 배정.
  const hour = scheduledIso ? new Date(scheduledIso).getHours() : new Date().getHours()
  const { theme, emoji } = themeForHour(hour)

  return {
    matchPairId: raw.matchPairId,
    status: raw.status,
    acceptDeadlineAt: serverDateTimeToIso(raw.acceptDeadlineAt),
    opponent: {
      nickname: raw.partnerProfile?.nickname ?? '상대',
      // 원본 age 는 여기서 연령대로 바꿔 버린다 — 뷰모델 밖으로 나가지 않는다.
      ageBand: toAgeBand(raw.partnerProfile?.age),
      faceTag: null,
    },
    session: {
      sessionId: raw.roomId,
      scheduledStartAt: scheduledIso,
      // 서버 매칭 응답에는 소요시간이 없다. 세션 조회(GET /sessions/{id})에서 확정된다.
      plannedDurationMin: 30,
      themeName: theme.name,
      themeEmoji: emoji,
      myPracticeGoal: practiceGoal,
    },
    // 상대 응답은 boolean 으로만 좁힌다 — REJECTED 를 화면이 구분할 수 없게(정책).
    opponentAccepted: raw.partnerResponse === 'ACCEPTED',
    myResponse: raw.myResponse,
  }
}

/** 큐 등록이 온보딩 미완료로 막혔는지. 화면 안내 문구를 갈라 쓰기 위한 판별. */
export function onboardingBlockReason(error: unknown): string | null {
  switch (errorCodeOf(error)) {
    case 'MATCH_PROFILE_REQUIRED':
      return '기본 프로필을 먼저 등록해야 매칭을 신청할 수 있어요.'
    case 'MATCH_SURVEY_REQUIRED':
      return '온보딩 설문(선호 얼굴상·성격)을 먼저 완료해야 매칭을 신청할 수 있어요.'
    case 'MATCH_FACE_ANALYSIS_REQUIRED':
      return '얼굴상 분석을 먼저 완료해야 매칭을 신청할 수 있어요.'
    default:
      return null
  }
}
