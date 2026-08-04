import { AxiosError } from 'axios'
import { create } from 'zustand'
import { tokenStore } from '@/shared/api/tokens'
import { getMe, logout as logoutApi } from '@/features/auth/api'
import { getOnboardingStatus } from '@/features/profile/api'
import { getMyConsents } from '@/features/consent/api'
import { isRequiredConsent } from '@/features/consent/types'
import { getMySurvey } from '@/features/survey/api'
import type { AuthTokens, MeResponse, UserRole } from '@/features/auth/types'

export interface AuthUser {
  id: string
  email: string
  /** 표시명. 프로필 닉네임 확정 전에는 실명을 사용한다(/me 응답엔 닉네임이 없음). */
  nickname: string
  role: UserRole
  /** 성인 여부. /me 응답엔 생년월일이 없어 현재는 가입 시점 게이트에 의존한다. */
  isAdult: boolean
}

/** GET /users/me(UserResponse) → 스토어 유저로 매핑. */
function toAuthUser(me: MeResponse): AuthUser {
  return {
    id: String(me.userId),
    email: me.email,
    nickname: me.realName,
    role: me.role,
    isAdult: true,
  }
}

/**
 * 온보딩 게이트 판정값 — **어느 단계에서 멈췄는지**까지 구분한다.
 *  - `unknown`      : 아직 모름(조회 전) 또는 판단 불가 → 통과시킨다
 *  - `needs-consent`: 필수 동의를 아직 안 했다
 *  - `needs-profile`: 기본 프로필이 없다
 *  - `needs-survey` : 프로필은 있는데 설문을 안 냈다
 *  - `ready`        : 통과
 *
 * 되돌려보낼 화면은 `ProtectedRoute` 가 이 값으로 정한다.
 */
export type OnboardingStatus =
  | 'unknown'
  | 'needs-consent'
  | 'needs-profile'
  | 'needs-survey'
  | 'ready'

/**
 * 중간 이탈 지점을 찾는다. 동의 → 프로필 → 설문 순으로 앞 단계부터 확인하고,
 * 처음 비어 있는 단계를 돌려준다.
 *
 * ⚠️ `onboardingCompleted` 를 단독 기준으로 쓸 수 없다.
 *    백엔드에서 이 값을 true 로 만드는 경로가 로컬 시드 초기화
 *    (`LocalMatchTestDataInitializer`)뿐이라 실사용자는 영원히 false 다.
 *    그것만 보고 막으면 아무도 온보딩을 빠져나가지 못한다.
 *    → true 면 곧바로 통과시키되(시드 계정), false 여도 각 단계의 실제 데이터로
 *      다시 판정한다.
 *    TODO(ONBOARDING): 설문 제출이 `markOnboardingCompleted()` 를 호출하도록
 *    백엔드가 바뀌면 이 함수를 그 한 번의 호출로 줄인다.
 *
 * ⚠️ 본인인증(KYC)은 판정에서 뺐다. 완료 여부를 알 수 있는 신호가 없다
 *    (`/users/me` 응답에 생년월일·전화번호가 없다). 이메일 가입자는 가입 폼에서
 *    이미 받았고, 소셜 가입자는 백엔드가 아예 수집하지 않는 별개 문제다.
 *
 * 계약 주의: 프로필이 없으면 `{onboardingCompleted:false}` 가 아니라
 * **404 PROFILE_NOT_FOUND** 가 온다 — 오류가 아니라 '프로필 없음' 신호다.
 * 그 밖의 오류(네트워크·5xx)는 `unknown` 으로 두어 일시적 장애가 사용자를
 * 가두지 않게 한다(실제 기능 제한은 백엔드가 다시 건다).
 */
async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  // 1) 프로필. `onboardingCompleted` 가 true 면 더 볼 것 없이 통과시킨다
  //    — 로컬 시드 계정이 여기로 빠진다(그 값을 세우는 유일한 경로다).
  let hasProfile: boolean
  try {
    const { onboardingCompleted } = await getOnboardingStatus()
    if (onboardingCompleted) return 'ready'
    hasProfile = true
  } catch (error) {
    const e = error as AxiosError<{ code?: string }>
    if (e?.response?.status === 404 || e?.response?.data?.code === 'PROFILE_NOT_FOUND') {
      hasProfile = false
    } else {
      return 'unknown'
    }
  }

  // 2) 필수 동의. 프로필보다 **앞 단계**라 프로필이 없어도 먼저 확인한다 —
  //    둘 다 비어 있으면 흐름 순서대로 동의부터 보내야 한다.
  //    서버는 활성 유형을 미동의 항목까지 전부 행으로 준다(consented 플래그로 구분).
  //    조회가 실패하면 동의 여부를 알 수 없으니 가두지 않는다.
  try {
    const required = (await getMyConsents()).filter((consent) => isRequiredConsent(consent.code))
    if (required.length > 0 && !required.every((consent) => consent.consented)) {
      return 'needs-consent'
    }
  } catch {
    return 'unknown'
  }

  if (!hasProfile) return 'needs-profile'

  // 3) 설문. 아직 안 냈으면 api 계층이 null 로 정규화해 준다.
  //    얼굴 촬영은 선택이라 게이트에 넣지 않는다(CONTRACT_DECISIONS.md A8).
  try {
    return (await getMySurvey()) ? 'ready' : 'needs-survey'
  } catch {
    return 'unknown'
  }
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  /** 온보딩 게이트 판정. `needs-profile` 일 때만 온보딩으로 돌려보낸다. */
  onboarding: OnboardingStatus
  /** 프로필 생성 직후처럼 게이트 상태를 즉시 갱신해야 할 때 사용. */
  setOnboarding: (value: OnboardingStatus) => void
  /** 토큰 저장 후 /me 로 신원을 채운다. (로그인·회원가입 성공 시 호출) */
  signIn: (tokens: AuthTokens) => Promise<void>
  /** 앱 부팅 시: 토큰이 있으면 /me 로 유저를 복원, 실패하면 세션 정리. */
  hydrate: () => Promise<void>
  /** 서버 refresh 무효화 후 로컬 세션 정리. (실패해도 로컬은 반드시 비운다) */
  signOut: () => Promise<void>
  /** @deprecated 데모/과거 호환용. 실제 흐름은 signIn 사용. */
  setSession: (user: AuthUser, accessToken: string, refreshToken?: string) => void
  /** 로컬 세션만 즉시 정리(서버 호출 없음). 회원 탈퇴 후처리 등에 사용. */
  logout: () => void
}

/** 로그인 상태 전역 스토어. (AUTH-01 ~ AUTH-03) */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: Boolean(tokenStore.getAccess()),
  onboarding: 'unknown',

  setOnboarding: (value) => set({ onboarding: value }),

  signIn: async (tokens) => {
    tokenStore.set(tokens.accessToken, tokens.refreshToken)
    const me = await getMe()
    // 신원을 먼저 반영해 화면 전환을 막지 않고, 온보딩 여부는 이어서 채운다
    set({ user: toAuthUser(me), isAuthenticated: true })
    set({ onboarding: await fetchOnboardingStatus() })
  },

  hydrate: async () => {
    if (!tokenStore.getAccess()) return
    try {
      const me = await getMe()
      set({ user: toAuthUser(me), isAuthenticated: true })
      set({ onboarding: await fetchOnboardingStatus() })
    } catch {
      // 만료·무효 토큰 — 조용히 세션 정리(인터셉터가 이미 처리했을 수 있음)
      tokenStore.clear()
      set({ user: null, isAuthenticated: false, onboarding: 'unknown' })
    }
  },

  signOut: async () => {
    const refreshToken = tokenStore.getRefresh()
    try {
      if (refreshToken) await logoutApi(refreshToken)
    } catch {
      // 서버 실패해도 로컬 세션은 정리한다
    }
    tokenStore.clear()
    set({ user: null, isAuthenticated: false, onboarding: 'unknown' })
  },

  setSession: (user, accessToken, refreshToken) => {
    tokenStore.set(accessToken, refreshToken)
    set({ user, isAuthenticated: true })
  },

  logout: () => {
    tokenStore.clear()
    set({ user: null, isAuthenticated: false, onboarding: 'unknown' })
  },
}))
