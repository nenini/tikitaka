import { apiClient } from '@/shared/api/client'
import { unwrap, type ApiEnvelope } from '@/shared/api/envelope'
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
 *  - 성공 응답 `{ success, data }` 래퍼 → `unwrap()` 으로 벗겨서 반환.
 *    (규칙 SSOT: `@/shared/api/envelope`)
 */
const BASE = '/v1/users'

/** 온보딩 4단계: 기본 프로필 생성. (인증 필요 — 가입 직후 토큰으로 호출) */
export async function createProfile(payload: ProfileCreatePayload): Promise<ProfileResponse> {
  return unwrap(await apiClient.post<ApiEnvelope<ProfileResponse>>(`${BASE}/me/profile`, payload))
}

/** 내 프로필 조회. (마이페이지·프로필 편집 하이드레이션) */
export async function getMyProfile(): Promise<ProfileResponse> {
  return unwrap(await apiClient.get<ApiEnvelope<ProfileResponse>>(`${BASE}/me/profile`))
}

/** 내 프로필 부분 수정. 보낸 필드만 변경된다. */
export async function updateProfile(payload: ProfileUpdatePayload): Promise<ProfileResponse> {
  return unwrap(await apiClient.patch<ApiEnvelope<ProfileResponse>>(`${BASE}/me/profile`, payload))
}

/** 상대 공개 프로필 조회(닉네임·성별·지역·나이). */
export async function getPublicProfile(userId: number): Promise<PublicProfileResponse> {
  return unwrap(
    await apiClient.get<ApiEnvelope<PublicProfileResponse>>(`${BASE}/${userId}/public-profile`),
  )
}

/** 온보딩 완료 여부. (온보딩 게이트·리다이렉트 판단) */
export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  return unwrap(
    await apiClient.get<ApiEnvelope<OnboardingStatusResponse>>(`${BASE}/me/onboarding-status`),
  )
}
