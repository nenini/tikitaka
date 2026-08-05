import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type { ReportStatusResponse, SessionReport } from './types'

/**
 * AI 세션 리포트(REPORT) REST.
 *
 * **데모 폴백을 두지 않는다.** 없으면 없다고 말한다(아래 getReportStatus 주석 참고).
 * apiClient.baseURL 이 `/api` 이므로 여기서는 `/v1/...` 부터 적는다.
 * 성공 응답은 `{ success, data }` 래퍼 → `unwrap()` (규칙 SSOT: `@/shared/api/envelope`).
 *
 *   GET  /api/v1/sessions/{id}/reports/status     생성 상태(PENDING·GENERATING·COMPLETED·FAILED)
 *   GET  /api/v1/sessions/{id}/reports/me         내 세션 리포트 (W-16 본체)
 *   POST /api/v1/sessions/{id}/reports            생성 요청(FAILED 재시도)
 *
 * ⚠️ 명세에는 조각별 조회도 있다 —
 *   /reports/me/radar · /metrics · /strengths · /improvements · /next-missions ·
 *   /topics · /warnings · /filler-words · /issues/{issueId}
 * W-16 은 한 화면에 전부 그리므로 **`/reports/me` 하나가 위 조각을 모두 포함한다**고 가정했다
 * (엔드포인트 9번 호출 대신). 서버가 조각만 제공하면 이 파일에서 Promise.all 로 합치면 된다.
 */

const reportBase = (sessionId: string) => `/v1/sessions/${sessionId}/reports`

/**
 * 리포트 생성 상태. **아직 서버에 없는 기능이면 `null`** 을 돌려준다.
 *
 * ⚠️ 예전에는 catch 에서 `{ reportStatus: 'COMPLETED' }` 를 지어냈다. 그러면
 *    "리포트가 완성됐다"고 화면에 말한 뒤 가짜 점수를 보여주게 된다 —
 *    서버 장애와 정상 동작이 구분되지 않는 것보다 나쁘다. 상호 평가에서 이미
 *    같은 이유로 폴백을 걷어냈고(1151bd0) 여기도 맞춘다.
 *
 * 백엔드에 리포트 엔드포인트가 아직 없어 `404 RESOURCE_NOT_FOUND` 가 온다
 * (2026-08-04 실측, BACKEND_DEPENDENCIES.md A38). 그건 오류가 아니라
 * '기능 없음'이라 null 로 정규화하고, 그 밖의 오류는 그대로 던진다.
 */
export async function getReportStatus(sessionId: string): Promise<ReportStatusResponse | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<ReportStatusResponse>>(`${reportBase(sessionId)}/status`),
    )
  } catch (error) {
    if (isReportUnavailable(error)) return null
    throw error
  }
}

/** 리포트 본체. 없으면 `null`. */
export async function getSessionReport(sessionId: string): Promise<SessionReport | null> {
  try {
    return unwrap(await apiClient.get<ApiEnvelope<SessionReport>>(`${reportBase(sessionId)}/me`))
  } catch (error) {
    if (isReportUnavailable(error)) return null
    throw error
  }
}

/** 엔드포인트 부재(404)인가. 서버 장애(5xx)와 구분해야 화면 문구가 달라진다. */
function isReportUnavailable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status === 404 || errorCodeOf(error) === 'RESOURCE_NOT_FOUND'
}

/** 생성 실패 시 재요청. 성공하면 상태가 GENERATING 으로 돌아간다. */
export async function requestReportGeneration(sessionId: string): Promise<void> {
  await apiClient.post(reportBase(sessionId))
}
