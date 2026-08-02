import { useMediaQuery } from './useMediaQuery'

/**
 * 디자인 시스템의 `.bt-question-card--row` peek 브레이크포인트와 **같은 값**을 쓴다.
 * 두 값이 어긋나면 캐러셀 폭 계산과 orientation 전환 시점이 따로 놀아 레이아웃이 깨진다.
 * (components.css 의 `@media (max-width: 639px)` 참고)
 */
const COMPACT_QUERY = '(max-width: 639px)'

/**
 * 좁은 화면(모바일) 여부. 세션 화면에서 질문 카드를 세로 스택 ↔ 가로 캐러셀로
 * 전환하는 데 쓴다 — CSS 만으로는 컴포넌트의 `orientation` prop 을 바꿀 수 없어서 필요하다.
 * 다른 브레이크포인트가 필요하면 useMediaQuery 를 직접 쓴다.
 */
export function useIsCompactViewport(): boolean {
  return useMediaQuery(COMPACT_QUERY)
}
