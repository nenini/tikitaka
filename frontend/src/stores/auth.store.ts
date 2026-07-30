import { create } from 'zustand'
import { tokenStore } from '@/shared/api/tokens'
import { getMe, logout as logoutApi } from '@/features/auth/api'
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

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
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

  signIn: async (tokens) => {
    tokenStore.set(tokens.accessToken, tokens.refreshToken)
    const me = await getMe()
    set({ user: toAuthUser(me), isAuthenticated: true })
  },

  hydrate: async () => {
    if (!tokenStore.getAccess()) return
    try {
      const me = await getMe()
      set({ user: toAuthUser(me), isAuthenticated: true })
    } catch {
      // 만료·무효 토큰 — 조용히 세션 정리(인터셉터가 이미 처리했을 수 있음)
      tokenStore.clear()
      set({ user: null, isAuthenticated: false })
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
    set({ user: null, isAuthenticated: false })
  },

  setSession: (user, accessToken, refreshToken) => {
    tokenStore.set(accessToken, refreshToken)
    set({ user, isAuthenticated: true })
  },

  logout: () => {
    tokenStore.clear()
    set({ user: null, isAuthenticated: false })
  },
}))
