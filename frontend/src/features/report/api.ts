import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type {
  ReportAxisDetail,
  ReportStatusResponse,
  SessionHistoryPage,
  SessionReportDetail,
} from './types'

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

/**
 * 축 하나의 근거(`GET /v1/reports/{id}/analyses/{axisCode}`).
 *
 * 리포트 본체의 `evidenceSegments` 는 세션 전체라 "왜 이 축이 이 점수인가"를 답하지 못한다.
 * 미측정 축은 서버가 줄 게 없어 404 가 오므로 `null` 로 정규화한다 — 오류 화면을 띄우면
 * 사용자는 자기가 뭘 잘못 눌렀다고 생각한다.
 */
export async function getAxisDetail(
  reportId: number,
  axisCode: string,
): Promise<ReportAxisDetail | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<ReportAxisDetail>>(
        `/v1/reports/${reportId}/analyses/${axisCode}`,
      ),
    )
  } catch (error) {
    if (isReportUnavailable(error)) return null
    throw error
  }
}

/**
 * 지난 세션 목록(`GET /v1/growth/sessions`).
 *
 * ⚠️ 경로가 **growth** 다. 리포트 전용 목록 엔드포인트가 없고, 세션 이력에
 *    `report: { exists, reportId, status }` 가 함께 오므로 이걸 목록의 원천으로 쓴다.
 *    리포트가 없는 세션도 함께 오는 게 오히려 맞다 — "왜 이 세션은 리포트가 없지"를
 *    화면에서 설명할 수 있다.
 *
 * 커서 페이지네이션이다. 첫 장은 `cursor` 없이 부르고, 다음 장은 `nextCursor` 를 넘긴다.
 */
export async function getSessionHistory(params?: {
  cursor?: number | null
  size?: number
}): Promise<SessionHistoryPage> {
  const search = new URLSearchParams()
  if (params?.cursor != null) search.set('cursor', String(params.cursor))
  if (params?.size != null) search.set('size', String(params.size))
  const query = search.toString()
  return unwrap(
    await apiClient.get<ApiEnvelope<SessionHistoryPage>>(
      `/v1/growth/sessions${query ? `?${query}` : ''}`,
    ),
  )
}
