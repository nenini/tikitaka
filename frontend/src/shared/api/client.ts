import axios, { AxiosError } from 'axios'
import { tokenStore } from './tokens'

/**
 * 공용 Axios 인스턴스. (모든 REST 요청은 이 인스턴스를 통해 나간다)
 * - 요청: Access Token 자동 첨부
 * - 응답: 401 시 토큰 정리 후 로그인으로 유도 (refresh 재발급 로직은 AUTH 담당이 확장)
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccess()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // TODO(AUTH): refresh 토큰으로 재발급 시도 후 실패 시에만 로그아웃 처리
      tokenStore.clear()
      if (location.pathname !== '/login') {
        location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)
