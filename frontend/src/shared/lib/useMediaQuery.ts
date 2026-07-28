import { useEffect, useState } from 'react'

/**
 * 미디어 쿼리 구독. **CSS 로는 안 되는 분기**에만 쓴다 —
 * 렌더 트리 자체가 달라지거나(카드 유무·컴포넌트 교체) prop 값이 바뀌는 경우.
 * 단순 표시/숨김은 Tailwind 반응형 유틸로 처리하는 편이 싸다.
 *
 * ⚠️ 쿼리 문자열은 Tailwind 브레이크포인트와 **같은 값**을 써야 한다.
 *    두 값이 어긋나면 그 사이 폭에서 둘 다 사라지거나 둘 다 보이는 구간이 생긴다.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches),
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const sync = () => setMatches(mql.matches)
    // 마운트 시점과 구독 사이에 값이 바뀌었을 수 있으므로 한 번 동기화한다.
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [query])

  return matches
}
