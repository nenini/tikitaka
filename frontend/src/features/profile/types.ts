/**
 * Profile 도메인 타입 — 백엔드 계약(`/api/v1/users/me/profile` 등)과 1:1 매핑.
 * 백엔드 SSOT: ProfileResponse / ProfileCreateRequest / ProfileUpdateRequest /
 *              PublicProfileResponse / OnboardingStatusResponse / Gender.
 */

/** 백엔드 Gender enum (대문자). 프론트 폼의 'male'|'female' 과는 매핑해서 쓴다. */
export type Gender = 'MALE' | 'FEMALE'

/** GET/POST/PATCH /me/profile 응답(ProfileResponse). */
export interface ProfileResponse {
  userId: number
  nickname: string
  gender: Gender
  regionCity: string
  onboardingCompleted: boolean
}

/** POST /me/profile 요청(ProfileCreateRequest). nickname 2~30, regionCity ≤50, 모두 필수. */
export interface ProfileCreatePayload {
  nickname: string
  gender: Gender
  regionCity: string
}

/** PATCH /me/profile 요청(ProfileUpdateRequest). 모든 필드 선택 — 보낸 것만 변경된다. */
export interface ProfileUpdatePayload {
  nickname?: string
  gender?: Gender
  regionCity?: string
}

/** GET /{userId}/public-profile 응답(PublicProfileResponse). 상대에게 공개되는 축약본. */
export interface PublicProfileResponse {
  nickname: string
  gender: Gender
  regionCity: string
  age: number
}

/** GET /me/onboarding-status 응답(OnboardingStatusResponse). */
export interface OnboardingStatusResponse {
  onboardingCompleted: boolean
}
