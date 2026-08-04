import { apiClient } from '@/shared/api/client'
import { unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type { ConsentType, SaveConsentsPayload, UserConsentStatus } from './types'

/**
 * 동의(CONSENT) REST 배선. (AUTH-03)
 *
 *   GET    /api/v1/consents                              활성 동의 유형 목록
 *   GET    /api/v1/users/me/consents                     내 동의 상태
 *   PUT    /api/v1/users/me/consents                     여러 건 일괄 저장
 *   DELETE /api/v1/users/me/consents/{consentTypeId}     개별 철회
 */

/** 가입 화면에서 무엇을 물어볼지 정하기 위한 활성 유형 목록. */
export async function getActiveConsentTypes(): Promise<ConsentType[]> {
  return unwrap(await apiClient.get<ApiEnvelope<ConsentType[]>>('/v1/consents'))
}

export async function getMyConsents(): Promise<UserConsentStatus[]> {
  return unwrap(await apiClient.get<ApiEnvelope<UserConsentStatus[]>>('/v1/users/me/consents'))
}

/** 일괄 저장. 서버가 `consents` 를 비어 있지 않게 요구한다(@NotEmpty). */
export async function saveMyConsents(payload: SaveConsentsPayload): Promise<UserConsentStatus[]> {
  return unwrap(
    await apiClient.put<ApiEnvelope<UserConsentStatus[]>>('/v1/users/me/consents', payload),
  )
}

/** 개별 철회. 재동의는 `saveMyConsents` 로 다시 켠다. */
export async function withdrawMyConsent(consentTypeId: number): Promise<UserConsentStatus> {
  return unwrap(
    await apiClient.delete<ApiEnvelope<UserConsentStatus>>(`/v1/users/me/consents/${consentTypeId}`),
  )
}
