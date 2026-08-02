import { apiClient } from './client'
import { unwrap } from './envelope'
import type { ApiEnvelope } from './envelope'

/**
 * 내 프로필 · 설문 조회. 매칭(연령 범위)·대기방(세션 목표)·챗봇(지역)이 공통으로 쓴다.
 *
 *   GET   /api/v1/users/me/profile             ProfileResponse
 *   PATCH /api/v1/users/me/profile             ProfileUpdateRequest
 *   GET   /api/v1/users/me/onboarding-status   OnboardingStatusResponse
 *   GET   /api/v1/users/me/survey              SurveyResponse
 *   GET   /api/v1/surveys/options              SurveyOptionsResponse
 *
 * ⚠️ 온보딩 화면(W-04 프로필 · W-06 설문)은 아직 없다. 여기서는 **읽기만** 한다 —
 *    설문이 비어 있으면 매칭 큐 등록이 서버에서 막히므로(MATCH_SURVEY_REQUIRED),
 *    호출부는 404/400 을 "온보딩 미완료"로 해석해 안내한다.
 */

export type Gender = 'MALE' | 'FEMALE'
export type GoalCategory = 'SPEECH_AMOUNT' | 'VOICE_VOLUME' | 'OTHER'
export type ApplicableGender = 'MALE' | 'FEMALE' | 'ALL'

/** GET /users/me/profile */
export interface MyProfile {
  userId: number
  nickname: string
  gender: Gender
  regionCity: string | null
  onboardingCompleted: boolean
}

export interface CatalogItem {
  id: number
  code: string
  name: string
}

export interface FaceTagItem extends CatalogItem {
  applicableGender: ApplicableGender
}

export interface PracticeGoalItem extends CatalogItem {
  category: GoalCategory
}

/** GET /users/me/survey — 온보딩 설문 결과(SurveyResponse). */
export interface MySurvey {
  userId: number
  preferredFaceTag: FaceTagItem
  preferredTraits: CatalogItem[]
  userTraits: CatalogItem[]
  /** ⚠️ 설문은 `minPreferredAge`/`maxPreferredAge`, 매칭 요청은 `preferredAgeMin/Max` — 백엔드 내부 네이밍이 다르다. */
  minPreferredAge: number
  maxPreferredAge: number
  practiceGoals: PracticeGoalItem[]
}

export async function getMyProfile(): Promise<MyProfile> {
  return unwrap(await apiClient.get<ApiEnvelope<MyProfile>>('/v1/users/me/profile'))
}

export async function getOnboardingStatus(): Promise<boolean> {
  const data = unwrap(
    await apiClient.get<ApiEnvelope<{ onboardingCompleted: boolean }>>('/v1/users/me/onboarding-status'),
  )
  return data.onboardingCompleted
}

export async function getMySurvey(): Promise<MySurvey> {
  return unwrap(await apiClient.get<ApiEnvelope<MySurvey>>('/v1/users/me/survey'))
}

/** 설문이 아직 없으면 null. (미완료를 예외가 아니라 값으로 다루고 싶은 호출부용) */
export async function getMySurveyOrNull(): Promise<MySurvey | null> {
  try {
    return await getMySurvey()
  } catch {
    return null
  }
}

/**
 * 시·도 저장. 챗봇 최초 이용 시 지역을 받는다(§7.1).
 * ⚠️ 와이어플로우에는 `PATCH /api/me/profile` 로 적혀 있지만 실제 경로는 `/api/v1/users/me/profile` 이다.
 */
export async function updateRegionCity(regionCity: string): Promise<MyProfile> {
  return unwrap(await apiClient.patch<ApiEnvelope<MyProfile>>('/v1/users/me/profile', { regionCity }))
}

/**
 * 내 첫 번째 세션 목표(온보딩 '고치고 싶은 점').
 * 대기방·세션·매칭 카드가 "내 개선 목표"로 표시한다. 백엔드에 세션별 목표 조회
 * 엔드포인트(`/sessions/{id}/goal`)는 없으므로 설문 값을 그대로 쓴다.
 */
export async function getMyPracticeGoal(): Promise<string | null> {
  const survey = await getMySurveyOrNull()
  return survey?.practiceGoals[0]?.name ?? null
}
