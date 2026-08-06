import { apiClient } from '@/shared/api/client'
import { unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type {
  AuthTokens,
  LoginPayload,
  MeResponse,
  OAuthProviderId,
  SignupPayload,
} from './types'

/**
 * Auth REST 배선. (AUTH-01 ~ AUTH-03)
 *
 * 경로 규약
 *  - apiClient.baseURL = '/api' (vite 프록시 → :8080, rewrite 없음)
 *  - 백엔드는 `/api/v1/...` 라 여기서는 '/v1/...' 로 호출한다.
 *  - 성공 응답은 `{ success, data }` 래퍼 → `unwrap()` 으로 벗겨서 반환한다.
 *    (규칙 SSOT: `@/shared/api/envelope`)
 */
const AUTH = '/v1/auth'

/** 회원가입 → 토큰 발급(가입 즉시 로그인 상태). birthDate 는 'yyyy-MM-dd'. */
export async function signup(payload: SignupPayload): Promise<AuthTokens> {
  return unwrap(
    await apiClient.post<ApiEnvelope<AuthTokens>>(`${AUTH}/signup`, payload, {
      skipAuthRefresh: true,
    }),
  )
}

/** 이메일/비밀번호 로그인 → 토큰 발급. (자격 오류 401 을 refresh 루프로 넘기지 않음) */
export async function login(payload: LoginPayload): Promise<AuthTokens> {
  return unwrap(
    await apiClient.post<ApiEnvelope<AuthTokens>>(`${AUTH}/login`, payload, {
      skipAuthRefresh: true,
    }),
  )
}

/**
 * refresh 토큰으로 access·refresh 재발급.
 * client.ts 401 인터셉터에서 단일 비행(single-flight)으로 호출한다.
 * skipAuthRefresh 플래그로 이 요청 자체는 401 재발급 루프에서 제외한다.
 */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  return unwrap(
    await apiClient.post<ApiEnvelope<AuthTokens>>(
      `${AUTH}/refresh`,
      { refreshToken },
      { skipAuthRefresh: true },
    ),
  )
}

/** 로그아웃 — 서버의 refresh 토큰 무효화. 실패해도 클라 토큰은 별도로 정리한다. */
export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post(`${AUTH}/logout`, { refreshToken }, { skipAuthRefresh: true })
}

/**
 * 회원 탈퇴 — `DELETE /api/v1/auth/account`.
 *
 * ⚠️ **행을 지우지 않는다.** 서버는 `accountStatus=WITHDRAWN` 으로 표시하고 리프레시 토큰을
 *    무효화한다(소프트 삭제). `users` 를 참조하는 FK 가 60개라, 행을 지우면 함께 세션을 했던
 *    **상대방의 기록까지** 사라진다. 로그인은 `INACTIVE_ACCOUNT` 로 막힌다.
 *
 * ⚠️ 본인 확인용 **비밀번호가 필수**다(`@NotBlank`). 소셜 가입 계정은 `passwordHash` 가 없어
 *    서버가 `INVALID_CREDENTIALS` 로 거절한다 — 현재 탈퇴할 수단이 없는 상태다.
 */
export async function withdrawAccount(password: string): Promise<void> {
  await apiClient.delete(`${AUTH}/account`, { data: { password } })
}

/** 현재 로그인 사용자 신원. 토큰 응답엔 유저 정보가 없어 로그인 직후 이걸로 하이드레이션한다. */
export async function getMe(): Promise<MeResponse> {
  return unwrap(await apiClient.get<ApiEnvelope<MeResponse>>('/v1/users/me'))
}

/**
 * OAuth 시작 — 브라우저를 백엔드 시작 엔드포인트로 이동시킨다.
 *   GET /api/v1/auth/oauth2/{provider}  → 302 provider 인가 화면
 * ⚠️ 콜백(`.../callback`)은 현재 JSON 토큰을 반환한다(백엔드 redirect-uri = 백엔드 자신).
 *    SPA 가 토큰을 받으려면 백엔드가 FE 라우트로 리다이렉트하도록 조율이 필요하다. AUTH_FLOW.md §5 참고.
 */
// 이동 중 중복 클릭 가드. 두 번 호출되면 두 번째 시작이 발급한 state 로 서버 쿠키가
// 덮어써지는데, 브라우저는 첫 번째 이동을 계속 진행해 콜백에 첫 번째 state 가 돌아온다.
// 그 state 는 이미 덮어써진 쿠키와 달라 INVALID_OAUTH_STATE 로 실패한다.
let oauthStarting = false

export function oauthStart(provider: OAuthProviderId): void {
  if (oauthStarting) return
  oauthStarting = true

  // `??` 가 아니라 `||` — .env 에 빈 값(VITE_API_BASE_URL=)이 들어와도 프록시 경로로 폴백해야 한다.
  // (`??` 는 빈 문자열을 통과시켜 `/api` 프리픽스가 빠지고, 프록시를 못 타 SPA 라우터로 떨어진다)
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  window.location.assign(`${base}/v1/auth/oauth2/${provider}`)
}
