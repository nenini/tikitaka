/**
 * Auth 도메인 타입 — 백엔드 계약(`/api/v1/auth`, `/api/v1/users/me`)과 1:1 매핑.
 * 백엔드 SSOT: AuthTokenResponse / UserResponse / SignupRequest / LoginRequest.
 */

/** 백엔드 공통 응답 래퍼. 모든 성공 응답이 `{ success, data }` 로 감싸져 온다. */
export interface ApiEnvelope<T> {
  success: boolean
  data: T
}

/** POST /login·/signup·/refresh 의 응답 본문(AuthTokenResponse). */
export interface AuthTokens {
  /** 항상 "Bearer" */
  tokenType: string
  accessToken: string
  /** access 만료까지 남은 초 */
  accessTokenExpiresIn: number
  refreshToken: string
  /** refresh 만료까지 남은 초 */
  refreshTokenExpiresIn: number
}

/** User.accountStatus (백엔드 AccountStatus enum). */
export type AccountStatus = 'ACTIVE' | 'SUSPENDED'

/** User.role (백엔드 UserRole enum). */
export type UserRole = 'USER' | 'ADMIN'

/** GET /api/v1/users/me 의 응답 본문(UserResponse). 로그인 후 신원 하이드레이션에 사용. */
export interface MeResponse {
  userId: number
  email: string
  realName: string
  phoneNumber: string | null
  accountStatus: AccountStatus
  role: UserRole
}

/** POST /login 요청 본문(LoginRequest). */
export interface LoginPayload {
  email: string
  password: string
}

/** POST /signup 요청 본문(SignupRequest). birthDate 는 `yyyy-MM-dd`(LocalDate) 필수. */
export interface SignupPayload {
  email: string
  password: string
  realName: string
  phoneNumber?: string
  /** ISO 로컬 날짜 'yyyy-MM-dd'. 백엔드 @Past @NotNull. */
  birthDate: string
}

/** 지원 OAuth 제공자(백엔드 OAuthProvider enum = GOOGLE, NAVER). 경로에는 소문자로 들어간다. */
export type OAuthProviderId = 'google' | 'naver'
