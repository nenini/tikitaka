import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type { ReportStatusResponse, SessionReportDetail } from './types'

/**
 * AI 세션 리포트(REPORT) REST.
 *
 * **데모 폴백을 두지 않는다.** 없으면 없다고 말한다 — 예전에 catch 에서
 * `{ reportStatus: 'COMPLETED' }` 를 지어냈고, 그러면 "리포트가 완성됐다"고 화면에 말한 뒤
 * 가짜 점수를 보여주게 된다. 서버 장애와 정상 동작이 구분되지 않는 것보다 나쁘다.
 *
 * apiClient.baseURL 이 `/api` 이므로 여기서는 `/v1/...` 부터 적는다.
 * 성공 응답은 `{ success, data }` 래퍼 → `unwrap()` (규칙 SSOT: `@/shared/api/envelope`).
 *
 * ⚠️ 경로가 **단수 `report`** 다. 서버가 없던 시절 프론트가 `reports/me` 를 가정했는데
 *    실제 계약과 달랐다(2026-08-05 교체).
 * ⚠️ 조회는 **2단계**다 — status 로 `reportId` 를 얻고, 그 id 로 상세를 읽는다.
 */

/**
 * 리포트 상태. 아직 생성 요청이 없으면 404 라 `null` 로 정규화한다.
 * 404 는 "만들다 실패"가 아니라 **아직 없음**이고, 5xx 는 그대로 던져 화면 문구를 가른다.
 */
export async function getReportStatus(sessionId: string): Promise<ReportStatusResponse | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<ReportStatusResponse>>(
        `/v1/sessions/${sessionId}/report/status`,
      ),
    )
  } catch (error) {
    if (isReportUnavailable(error)) return null
    throw error
  }
}

/** 리포트 본체. 없으면 `null`. */
export async function getReportDetail(reportId: number): Promise<SessionReportDetail | null> {
  try {
    return unwrap(await apiClient.get<ApiEnvelope<SessionReportDetail>>(`/v1/reports/${reportId}`))
  } catch (error) {
    if (isReportUnavailable(error)) return null
    throw error
  }
}

/** 엔드포인트·리소스 부재(404)인가. 서버 장애(5xx)와 구분해야 화면 문구가 달라진다. */
function isReportUnavailable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status === 404 || errorCodeOf(error) === 'RESOURCE_NOT_FOUND'
}

/**
 * 생성 재요청(202 Accepted). **`FAILED` 일 때만 유효하다** —
 * 서버 `resetForRetry` 가 다른 상태면 거절한다. 성공하면 상태가 PENDING 으로 돌아간다.
 *
 * 최초 생성은 세션 종료 이벤트(`AiSessionEndedEvent`)가 서버에서 자동으로 건다.
 */
export async function requestReportGeneration(sessionId: string): Promise<void> {
  await apiClient.post(`/v1/sessions/${sessionId}/report`)
}
