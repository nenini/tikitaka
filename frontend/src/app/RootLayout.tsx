import { Outlet, ScrollRestoration } from 'react-router-dom'

/**
 * 모든 라우트를 감싸는 최상위 레이아웃. 화면을 그리지 않고 **스크롤 위치만** 맡는다.
 *
 * SPA 는 화면을 바꿔도 문서가 그대로라 브라우저가 스크롤을 되돌려 주지 않는다. 그래서
 * 설문(`/signup/survey`)처럼 긴 화면에서 아래까지 내려간 뒤 홈으로 넘어오면 **그 위치가
 * 그대로 따라와** 홈 중간부터 보였다.
 *
 * `ScrollRestoration` 은 두 경우를 나눠 처리한다.
 *   - 새 이동(PUSH/REPLACE) → 맨 위로. 온보딩 → 홈이 여기 해당한다.
 *   - 뒤로/앞으로(POP)      → 떠날 때 위치로 복원. 목록에서 상세를 보고 돌아올 때 필요하다.
 *
 * 그래서 일괄 `window.scrollTo(0, 0)` 대신 이걸 쓴다. 전자는 뒤로가기까지 맨 위로 보내
 * 긴 목록에서 보던 자리를 잃게 만든다.
 *
 * ⚠️ 창(document) 스크롤만 복원한다. 자체 스크롤 컨테이너를 가진 화면
 *    (챗봇 대화창, 코칭 기록 카드)은 각자 관리한다 — 이 컴포넌트가 관여하지 않는다.
 */
export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
