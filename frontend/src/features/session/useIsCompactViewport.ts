import { useEffect, useState } from 'react'

/**
 * 디자인 시스템의 `.bt-question-card--row` peek 브레이크포인트와 **같은 값**을 쓴다.
 * 두 값이 어긋나면 캐러셀 폭 계산과 orientation 전환 시점이 따로 놀아 레이아웃이 깨진다.
 * (components.css 의 `@media (max-width: 639px)` 참고)
 */
const COMPACT_QUERY = '(max-width: 639px)'

/**
 * 좁은 화면(모바일) 여부. 세션 화면에서 질문 카드를 세로 스택 ↔ 가로 캐러셀로
 * 전환하는 데 쓴다 — CSS 만으로는 컴포넌트의 `orientation` prop 을 바꿀 수 없어서 필요하다.
 */
export function useIsCompactViewport(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(COMPACT_QUERY).matches),
  )

  useEffect(() => {
    const mql = window.matchMedia(COMPACT_QUERY)
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches)
    // 마운트 시점과 구독 사이에 값이 바뀌었을 수 있으므로 한 번 동기화한다.
    setCompact(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return compact
}
