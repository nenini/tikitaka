import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type { SurveyAnswer, SurveyOptions, SurveySavePayload } from './types'

/**
 * 설문(SURVEY) REST 배선. (SURVEY-01)
 *
 * 성공 응답은 `{ success, data }` 래퍼 → `unwrap()` (규칙 SSOT: `@/shared/api/envelope`).
 */

/** 선택지 조회. 프로필이 없으면 서버가 실패시킨다(온보딩 순서 강제). */
export async function getSurveyOptions(): Promise<SurveyOptions> {
  return unwrap(await apiClient.get<ApiEnvelope<SurveyOptions>>('/v1/surveys/options'))
}

/**
 * 내 설문 응답. 아직 등록 전이면 `null`.
 * 서버는 `SURVEY_NOT_FOUND`(404) 로 알려주는데, 이건 오류가 아니라 '아직 안 냄' 이다.
 */
export async function getMySurvey(): Promise<SurveyAnswer | null> {
  try {
    return unwrap(await apiClient.get<ApiEnvelope<SurveyAnswer>>('/v1/users/me/survey'))
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || errorCodeOf(error) === 'SURVEY_NOT_FOUND') return null
    throw error
  }
}

/** 최초 등록. 이미 있으면 `SURVEY_ALREADY_EXISTS`(409). */
export async function createMySurvey(payload: SurveySavePayload): Promise<SurveyAnswer> {
  return unwrap(await apiClient.post<ApiEnvelope<SurveyAnswer>>('/v1/users/me/survey', payload))
}

/** 전체 수정. 부분 수정이 아니라 매번 전체를 보낸다. */
export async function updateMySurvey(payload: SurveySavePayload): Promise<SurveyAnswer> {
  return unwrap(await apiClient.put<ApiEnvelope<SurveyAnswer>>('/v1/users/me/survey', payload))
}
