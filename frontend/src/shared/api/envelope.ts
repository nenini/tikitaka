import type { AxiosResponse } from 'axios'

/**
 * 백엔드 공통 성공 응답 래퍼.
 * SSOT: `backend/global/api/ApiResponse.java` — 모든 성공 응답이 `{ success, data }` 로 감싸져 온다.
 *
 * ⚠️ 인터셉터에서 전역 언랩을 하지 않는 이유: AUTH(FE-A)가 이미 `res.data.data` 규약으로
 *    구현돼 있어서, 전역에서 벗기면 그쪽이 조용히 깨진다. 규약을 그대로 따르고
 *    반복만 `unwrap()` 으로 줄인다.
 */
export interface ApiEnvelope<T> {
  success: boolean
  data: T
}

/** `apiClient` 응답에서 payload 만 꺼낸다. */
export function unwrap<T>(res: AxiosResponse<ApiEnvelope<T>>): T {
  return res.data.data
}

/**
 * 백엔드 오류 응답 본문.
 * SSOT: `backend/global/api/ApiErrorResponse.java`
 */
export interface ApiErrorBody {
  success: false
  code: string
  message: string
  errors: { field: string; rejectedValue: unknown; reason: string }[]
  timestamp: string
  path: string
}

/** axios 오류에서 백엔드 오류 코드를 꺼낸다. 없으면 null. */
export function errorCodeOf(error: unknown): string | null {
  const body = (error as { response?: { data?: unknown } })?.response?.data
  if (body && typeof body === 'object' && typeof (body as ApiErrorBody).code === 'string') {
    return (body as ApiErrorBody).code
  }
  return null
}

/** axios 오류에서 사용자에게 보여줄 메시지를 꺼낸다. 없으면 fallback. */
export function errorMessageOf(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: unknown } })?.response?.data
  if (body && typeof body === 'object') {
    const typed = body as ApiErrorBody
    if (typed.errors?.length && typed.errors[0].reason) return typed.errors[0].reason
    if (typeof typed.message === 'string' && typed.message) return typed.message
  }
  return fallback
}
