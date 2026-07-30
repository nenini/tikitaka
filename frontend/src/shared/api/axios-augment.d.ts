import 'axios'

/**
 * axios 요청 설정 보강.
 * `skipAuthRefresh` 가 true 인 요청은 401 응답 인터셉터의 refresh 재발급 루프에서 제외한다.
 * (refresh/login/logout 자체가 401 재발급을 다시 트리거하는 무한 루프를 막기 위함)
 */
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuthRefresh?: boolean
  }
}
