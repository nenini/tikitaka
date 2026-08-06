import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap } from '@/shared/api/envelope'
import type { ApiEnvelope } from '@/shared/api/envelope'
import type {
  QuestionCardList,
  SessionAnalysisSettings,
  SessionDetail,
  SessionEndedPayload,
  SessionExtensionDecision,
  SessionExtensionEvent,
  SessionJoinResult,
  SessionMissions,
  SessionStatusSnapshot,
  SessionTerminateReason,
} from './types'

/**
 * 세션 REST.
 *
 * 백엔드 SSOT
 *   GET   /api/v1/sessions/{id}                    SessionDetailResponse
 *   POST  /api/v1/sessions/{id}/join               SessionJoinResponse  ← LiveKit url/token
 *   POST  /api/v1/sessions/{id}/start              SessionStatusResponse
 *   PATCH /api/v1/sessions/{id}/analysis-settings   SessionAnalysisSettingsResponse
 *   GET   /api/v1/sessions/{id}/status             SessionStatusResponse (서버 잔여 시간 SSOT)
 *   POST  /api/v1/sessions/{id}/complete           SessionEndedResponse
 *   POST  /api/v1/sessions/{id}/terminate          SessionEndedResponse  ({ reason } 필수)
 *   GET   /api/v1/sessions/{id}/missions           SessionMissionsResponse
 *   GET   /api/v1/sessions/{id}/question-cards?limit=  QuestionCardListResponse (limit 1~5)
 */

/**
 * 입장. **LiveKit 접속 정보가 이 응답에 들어 있다** —
 * 별도의 토큰 발급 엔드포인트는 없다(`/sessions/livekit-token` 은 존재하지 않는다).
 *
 * 멱등: 이미 입장한 상태면 `alreadyJoined: true` 로 같은 정보를 다시 준다.
 * 그래서 대기방과 세션 화면이 각각 호출해도 안전하다.
 */
export async function joinSession(sessionId: number): Promise<SessionJoinResult> {
  return unwrap(await apiClient.post<ApiEnvelope<SessionJoinResult>>(`/v1/sessions/${sessionId}/join`))
}

export async function getSessionDetail(sessionId: number): Promise<SessionDetail> {
  return unwrap(await apiClient.get<ApiEnvelope<SessionDetail>>(`/v1/sessions/${sessionId}`))
}

/** 서버가 계산한 상태·잔여 시간. 클라이언트 타이머의 기준점으로 쓴다. */
export async function getSessionStatus(sessionId: number): Promise<SessionStatusSnapshot> {
  return unwrap(
    await apiClient.get<ApiEnvelope<SessionStatusSnapshot>>(`/v1/sessions/${sessionId}/status`),
  )
}

/**
 * 세션 시작. 서버 조건이 까다롭다 —
 * status=READY · 2명 모두 joined · 모두 ready · 모두 LiveKit CONNECTED · 예정 시각 창 안.
 * 이미 진행 중이면 현재 상태를 그대로 돌려준다(멱등).
 *
 * 조건 미달은 409 다. 화면은 "아직 시작할 수 없음"으로 조용히 넘기고 재시도한다.
 */
export async function startSession(sessionId: number): Promise<SessionStatusSnapshot | null> {
  try {
    return unwrap(
      await apiClient.post<ApiEnvelope<SessionStatusSnapshot>>(`/v1/sessions/${sessionId}/start`),
    )
  } catch (error) {
    const code = errorCodeOf(error)
    if (
      code === 'SESSION_STATE_CONFLICT' ||
      code === 'SESSION_PARTICIPANTS_NOT_JOINED' ||
      code === 'SESSION_PARTICIPANTS_NOT_READY' ||
      code === 'SESSION_PARTICIPANTS_NOT_CONNECTED' ||
      code === 'SESSION_JOIN_TIME_NOT_ALLOWED'
    ) {
      return null
    }
    throw error
  }
}

/** 정상 종료(시간 만료·합의 종료). */
export async function completeSession(sessionId: number): Promise<SessionEndedPayload> {
  return unwrap(
    await apiClient.post<ApiEnvelope<SessionEndedPayload>>(`/v1/sessions/${sessionId}/complete`),
  )
}

/** 조기 종료. `reason` 은 필수다(`@NotNull`). */
export async function terminateSession(
  sessionId: number,
  reason: SessionTerminateReason,
): Promise<SessionEndedPayload> {
  return unwrap(
    await apiClient.post<ApiEnvelope<SessionEndedPayload>>(`/v1/sessions/${sessionId}/terminate`, {
      reason,
    }),
  )
}

/**
 * 음성·표정 분석 동의 설정. 세션 시작 **전에만** 바꿀 수 있다
 * (진행 중/종료 후에는 409 `SESSION_STATE_CONFLICT`).
 */
export async function updateAnalysisSettings(
  sessionId: number,
  settings: { voiceAnalysisEnabled: boolean; expressionAnalysisEnabled: boolean },
): Promise<SessionAnalysisSettings> {
  return unwrap(
    await apiClient.patch<ApiEnvelope<SessionAnalysisSettings>>(
      `/v1/sessions/${sessionId}/analysis-settings`,
      settings,
    ),
  )
}

/**
 * 5분 연장 의사 제출 (`CONTACT-01` · W-15).
 *
 * 양측이 모두 `AGREE` 여야 35분까지 유지되고, 한쪽이라도 `DECLINE` 이거나 미응답이면
 * 30분에 종료된다. 결과는 `/topic/sessions/{id}/extensions` 로 양쪽에 브로드캐스트된다.
 *
 * ⚠️ 서버가 **종료 5분 전부터**만 받는다(`EXTENSION_WINDOW_MINUTES`). 그 전에 부르면
 *    `SESSION_EXTENSION_WINDOW_NOT_OPEN`, 종료 시각을 넘기면 `SESSION_STATE_CONFLICT` 다.
 */
export async function decideSessionExtension(
  sessionId: number,
  decision: SessionExtensionDecision,
): Promise<SessionExtensionEvent> {
  return unwrap(
    await apiClient.post<ApiEnvelope<SessionExtensionEvent>>(
      `/v1/sessions/${sessionId}/extensions`,
      { decision },
    ),
  )
}

/** 내 세션 미션. 세션 시작 시 서버가 배정한다(`SessionMissionProvisioningService`). */
export async function getSessionMissions(sessionId: number): Promise<SessionMissions | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<SessionMissions>>(`/v1/sessions/${sessionId}/missions`),
    )
  } catch {
    // 아직 배정 전(세션 시작 전)이면 미션이 없다 — 화면은 목표 카드만 그린다.
    return null
  }
}

/** 침묵 힌트용 질문 카드. `limit` 은 서버 검증상 1~5. */
export async function getQuestionCards(sessionId: number, limit = 3): Promise<QuestionCardList | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<QuestionCardList>>(`/v1/sessions/${sessionId}/question-cards`, {
        params: { limit },
      }),
    )
  } catch {
    return null
  }
}
