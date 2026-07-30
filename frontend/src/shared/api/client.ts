import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { tokenStore } from './tokens'
import type { ApiEnvelope, AuthTokens } from '@/features/auth/types'

/**
 * 공용 Axios 인스턴스. (모든 REST 요청은 이 인스턴스를 통해 나간다)
 * - 요청: Access Token 자동 첨부
 * - 응답: 401 시 refresh 토큰으로 1회 재발급 후 원 요청 재시도. 실패 시에만 로그아웃 유도.
 *   재발급은 단일 비행(single-flight) — 동시에 401 이 여러 개 나도 refresh 는 한 번만 호출한다.
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

/** 진행 중인 refresh 요청. 있으면 재사용해 중복 재발급을 막는다. */
let refreshPromise: Promise<string | null> | null = null

/** refresh 토큰으로 새 access 를 받아 저장한다. 실패하면 토큰을 비우고 null 을 돌려준다. */
function requestRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) return Promise.resolve(null)

  refreshPromise = apiClient
    // skipAuthRefresh: 이 요청이 401 이어도 다시 재발급을 시도하지 않는다(무한 루프 방지)
    .post<ApiEnvelope<AuthTokens>>('/v1/auth/refresh', { refreshToken }, { skipAuthRefresh: true })
    .then((res) => {
      const tokens = res.data.data
      tokenStore.set(tokens.accessToken, tokens.refreshToken)
      return tokens.accessToken
    })
    .catch(() => {
      tokenStore.clear()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined

    // refresh 대상이 아닌 경우(비-401, 설정 없음, 이미 재시도, skip 플래그)는 그대로 실패시킨다.
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retried ||
      original.skipAuthRefresh
    ) {
      return Promise.reject(error)
    }

    original._retried = true
    const newAccess = await requestRefresh()

    if (newAccess) {
      original.headers.Authorization = `Bearer ${newAccess}`
      return apiClient(original)
    }

    // 재발급 실패 → 세션 종료. 로그인 화면으로 유도.
    if (location.pathname !== '/login') {
      location.assign('/login')
    }
    return Promise.reject(error)
  },
)
