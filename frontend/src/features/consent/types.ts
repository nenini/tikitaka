/**
 * 동의(CONSENT · AUTH-03) 도메인 타입.
 * 백엔드 SSOT: `ConsentController` + `consent/dto/*`, 유형 시드는
 * `V6__seed_consent_types.sql`.
 *
 * 확정 계약(2026-08-04, CONTRACT_DECISIONS.md A8):
 *   가입 동의 = 통합(필수) + 얼굴(선택) **2종**
 *   표정·음성 분석은 동의가 아니라 **세션 설정**으로 다룬다
 *     (PATCH /sessions/{id}/analysis-settings)
 *   누적 리포트 저장은 **통합 동의에 포함**되며 별도 항목을 두지 않는다
 */

/** 현재 서버가 시드하는 동의 코드. 행 추가로 늘어날 수 있어 문자열로 넓게 받는다. */
export type ConsentCode = 'INTEGRATED_SERVICE_CONSENT' | 'FACE_CAPTURE_CONSENT'

/** GET /api/v1/consents (ConsentTypeResponse). */
export interface ConsentType {
  consentTypeId: number
  code: string
  name: string
  version: string
}

/** GET·PUT /api/v1/users/me/consents (UserConsentStatusResponse). */
export interface UserConsentStatus extends ConsentType {
  consented: boolean
  consentedAt: string | null
  withdrawnAt: string | null
}

/** PUT /api/v1/users/me/consents 본문(SaveUserConsentsRequest). */
export interface SaveConsentsPayload {
  consents: { consentTypeId: number; consented: boolean }[]
}

/**
 * 필수 동의 코드.
 *
 * ⚠️ 서버 `consent_types` 에 필수/선택 구분 컬럼이 없어서 프론트가 코드로 판별한다.
 *    유형이 늘 때마다 이 목록을 고치고 배포해야 하므로, 백엔드에 `required` 컬럼을
 *    추가하면 이 상수는 지운다(CONTRACT_DECISIONS.md A8 후속 작업 1번).
 */
const REQUIRED_CONSENT_CODES: readonly string[] = ['INTEGRATED_SERVICE_CONSENT']

export function isRequiredConsent(code: string): boolean {
  return REQUIRED_CONSENT_CODES.includes(code)
}

/**
 * 코드별 설명 문구. 서버는 `name` 만 주고 설명은 주지 않는다.
 * 모르는 코드가 오면 설명 없이 `name` 만 그린다 — 새 유형이 추가돼도 화면은 깨지지 않는다.
 */
export const CONSENT_DESCRIPTION: Readonly<Record<string, string>> = {
  INTEGRATED_SERVICE_CONSENT:
    '계정 운영 · 연령 확인 · 신고 대응과, 세션 분석 결과(점수 · 키워드 · 누적 리포트) 저장에 사용돼요. 서비스 이용을 위한 필수 항목이에요.',
  FACE_CAPTURE_CONSENT:
    '분석이 끝나면 원본 사진은 즉시 폐기하고 얼굴상 태그만 저장해요. 거부하면 얼굴상 없이 이용할 수 있어요.',
}
