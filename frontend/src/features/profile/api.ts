import { apiClient } from '@/shared/api/client'
import type { ApiEnvelope } from '@/features/auth/types'
import type {
  OnboardingStatusResponse,
  ProfileCreatePayload,
  ProfileResponse,
  ProfileUpdatePayload,
  PublicProfileResponse,
} from './types'

/**
 * Profile REST 배선. (FE-PROFILE-01)
 *
 * 경로 규약
 *  - apiClient.baseURL = '/api' (vite 프록시 → :8080)
 *  - 백엔드는 `/api/v1/users/...` 라 여기서는 '/v1/users/...' 로 호출한다.
 *  - 성공 응답 `{ success, data }` 래퍼 → data 만 벗겨서 반환 (auth 모듈과 동일 규약).
 */
const BASE = '/v1/users'

/** 온보딩 4단계: 기본 프로필 생성. (인증 필요 — 가입 직후 토큰으로 호출) */
export async function createProfile(payload: ProfileCreatePayload): Promise<ProfileResponse> {
  const { data } = await apiClient.post<ApiEnvelope<ProfileResponse>>(`${BASE}/me/profile`, payload)
  return data.data
}

/** 내 프로필 조회. (마이페이지·프로필 편집 하이드레이션) */
export async function getMyProfile(): Promise<ProfileResponse> {
  const { data } = await apiClient.get<ApiEnvelope<ProfileResponse>>(`${BASE}/me/profile`)
  return data.data
}

/** 내 프로필 부분 수정. 보낸 필드만 변경된다. */
export async function updateProfile(payload: ProfileUpdatePayload): Promise<ProfileResponse> {
  const { data } = await apiClient.patch<ApiEnvelope<ProfileResponse>>(`${BASE}/me/profile`, payload)
  return data.data
}

/** 상대 공개 프로필 조회(닉네임·성별·지역·나이). */
export async function getPublicProfile(userId: number): Promise<PublicProfileResponse> {
  const { data } = await apiClient.get<ApiEnvelope<PublicProfileResponse>>(
    `${BASE}/${userId}/public-profile`,
  )
  return data.data
}

/** 온보딩 완료 여부. (온보딩 게이트·리다이렉트 판단) */
export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  const { data } = await apiClient.get<ApiEnvelope<OnboardingStatusResponse>>(
    `${BASE}/me/onboarding-status`,
  )
  return data.data
}
