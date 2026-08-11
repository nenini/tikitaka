/**
 * JWT 토큰 저장소. (AUTH-01)
 * MVP 단계에서는 localStorage 사용. 보안 강화 시 httpOnly 쿠키 + refresh 로 이관 검토.
 */
const ACCESS_KEY = 'bd_access_token'
const REFRESH_KEY = 'bd_refresh_token'

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh?: string) => {
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}
