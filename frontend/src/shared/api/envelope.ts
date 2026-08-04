import type { AxiosResponse } from 'axios'

/**
 * 백엔드 공통 성공 응답 래퍼. **이 파일이 유일한 정의(SSOT)** 다.
 * SSOT: `backend/global/api/ApiResponse.java` — 모든 성공 응답이 `{ success, data }` 로 감싸져 온다.
 *
 * ⚠️ 인터셉터에서 전역 언랩을 하지 않는 이유: 응답 타입이 `AxiosResponse<T>` 인 채로
 *    런타임만 벗겨지면 타입과 실제 값이 어긋나 컴파일러가 실수를 못 잡는다.
 *    대신 호출부가 `apiClient.get<ApiEnvelope<T>>(...)` 로 래퍼를 타입에 드러내고
 *    `unwrap()` 으로 벗긴다 — 래퍼를 빠뜨리면 타입 에러가 난다.
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

/**
 * axios 오류에서 서버가 준 메시지만 꺼낸다. 서버 메시지가 없으면 `undefined`.
 *
 * 필드 검증 오류(`errors[0].reason`)를 `message` 보다 먼저 쓴다 — 폼 화면에서
 * "이메일 형식이 아닙니다" 가 "잘못된 요청입니다" 보다 도움이 되기 때문이다.
 *
 * 메시지 유무로 분기해야 할 때(예: 회원가입에서 이메일 중복인지 판별) 이걸 쓰고,
 * 그냥 보여주기만 할 때는 폴백을 받는 `errorMessageOf` 를 쓴다.
 */
export function serverMessageOf(error: unknown): string | undefined {
  const body = (error as { response?: { data?: unknown } })?.response?.data
  if (body && typeof body === 'object') {
    const typed = body as ApiErrorBody
    if (typed.errors?.length && typed.errors[0].reason) return typed.errors[0].reason
    if (typeof typed.message === 'string' && typed.message) return typed.message
  }
  return undefined
}

/** axios 오류에서 사용자에게 보여줄 메시지를 꺼낸다. 없으면 fallback. */
export function errorMessageOf(error: unknown, fallback: string): string {
  return serverMessageOf(error) ?? fallback
}
