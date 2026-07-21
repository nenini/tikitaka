import { create } from 'zustand'
import { tokenStore } from '@/shared/api/tokens'

export interface AuthUser {
  id: string
  nickname: string
  isAdult: boolean
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  setSession: (user: AuthUser, accessToken: string, refreshToken?: string) => void
  logout: () => void
}

/** 로그인 상태 전역 스토어. (AUTH-01 ~ AUTH-03) */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: Boolean(tokenStore.getAccess()),
  setSession: (user, accessToken, refreshToken) => {
    tokenStore.set(accessToken, refreshToken)
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    tokenStore.clear()
    set({ user: null, isAuthenticated: false })
  },
}))
