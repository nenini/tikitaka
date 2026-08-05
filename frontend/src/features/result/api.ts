import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type {
  EvaluationItems,
  EvaluationStatus,
  EvaluationSubmitPayload,
  EvaluationSubmitResult,
  ModerationReasonCode,
  ReceivedEvaluation,
} from './types'

/**
 * 상호 평가(RESULT) + 신고·차단(MODERATION) REST.
 *
 * apiClient.baseURL 이 `/api` 이므로 여기서는 `/v1/...` 부터 적는다.
 * 성공 응답은 `{ success, data }` 래퍼 → `unwrap()` (규칙 SSOT: `@/shared/api/envelope`).
 *
 *   GET    /api/v1/sessions/{id}/evaluations/items    평가 항목·상대 userId·본문 길이 제한
 *   GET    /api/v1/sessions/{id}/evaluations/status   제출·마감·열람 가능 여부
 *   POST   /api/v1/sessions/{id}/evaluations          평가 제출
 *   GET    /api/v1/sessions/{id}/evaluations/result   내가 받은 평가
 *   POST   /api/v1/moderation/reports                 세션 상대 신고
 *   POST   /api/v1/users/{userId}/blocks              사용자 차단
 *
 * ⚠️ 데모 폴백을 두지 않는다. 예전에는 catch 에서 가짜 상대·점수·마감을 돌려줬는데,
 *    서버가 죽어도 화면이 정상처럼 보여 장애를 못 알아채는 쪽이 훨씬 위험하다.
 *    호출부가 오류를 받아 재시도/안내를 그리게 한다.
 *
 * ⚠️ 서버에 **내가 낸 평가를 되읽는 엔드포인트가 없다**(`/result` 는 내가 *받은* 평가다).
 *    제출 후 재진입하면 내 답을 복원하지 못하므로 "제출 완료" 상태만 보여준다.
 */

const evaluationBase = (sessionId: number) => `/v1/sessions/${sessionId}/evaluations`

/* ── 상호 평가 ─────────────────────────────────────────── */

export async function getEvaluationItems(sessionId: number): Promise<EvaluationItems> {
  return unwrap(await apiClient.get<ApiEnvelope<EvaluationItems>>(`${evaluationBase(sessionId)}/items`))
}

export async function getEvaluationStatus(sessionId: number): Promise<EvaluationStatus> {
  return unwrap(
    await apiClient.get<ApiEnvelope<EvaluationStatus>>(`${evaluationBase(sessionId)}/status`),
  )
}

/**
 * 제출. 서버가 세션 참여자·정상 종료·중복 제출·48h 마감을 검증한다.
 * 실패 코드: EVALUATION_ALREADY_SUBMITTED · EVALUATION_DEADLINE_EXPIRED ·
 *           EVALUATION_NOT_PARTICIPANT · EVALUATION_SESSION_NOT_COMPLETED
 */
export async function submitEvaluation(
  sessionId: number,
  payload: EvaluationSubmitPayload,
): Promise<EvaluationSubmitResult> {
  return unwrap(
    await apiClient.post<ApiEnvelope<EvaluationSubmitResult>>(evaluationBase(sessionId), payload),
  )
}

/**
 * 내가 받은 평가. 아직 열람 조건을 못 채웠으면 `null` 을 돌려준다 —
 * 잠금은 오류가 아니라 정상적인 진행 단계이기 때문이다.
 * 그 밖의 오류(네트워크·5xx)는 그대로 던져서 호출부가 장애로 다룬다.
 */
export async function getReceivedEvaluation(sessionId: number): Promise<ReceivedEvaluation | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<ReceivedEvaluation>>(`${evaluationBase(sessionId)}/result`),
    )
  } catch (error) {
    switch (errorCodeOf(error)) {
      case 'EVALUATION_RESULT_LOCKED': // 내가 아직 안 냈다
      case 'EVALUATION_NOT_COMPLETED': // 상대가 아직 안 냈다
      case 'EVALUATION_NOT_FOUND': // 상대 평가 자체가 없다
        return null
      default:
        throw error
    }
  }
}

/* ── 신고 · 차단(MODERATION) ───────────────────────────── */

/**
 * 세션 상대 신고. `details` 는 서버에서 `@NotBlank` 라 비워 보낼 수 없다.
 * 신고 사유 목록 API 는 없다 — `MODERATION_REASONS` 상수를 쓴다.
 */
export async function reportSessionUser(body: {
  sessionId: number
  reportedUserId: number
  reasonCode: ModerationReasonCode
  details: string
}): Promise<void> {
  await apiClient.post('/v1/moderation/reports', body)
}

/** 사용자 차단. 이미 차단돼 있어도 서버가 `alreadyBlocked` 로 성공 처리한다. */
export async function blockUser(userId: number, reason?: string): Promise<void> {
  await apiClient.post(`/v1/users/${userId}/blocks`, { reason })
}
