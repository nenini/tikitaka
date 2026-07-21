# blind-date-frontend 초기 세팅 정리


## 1. 시작하기

```bash
npm install
npm run dev      # http://localhost:5173
```

`.env.example`을 복사해 `.env`로 만들고 필요하면 값 채우기 (백엔드 주소 등). 안 채워도 vite가 `/api`, `/ws`를 프록시하도록 되어 있음.

---

## 2. 스택 요약 — 뭘 왜 골랐나

| 영역 | 선택 | 왜 |
|---|---|---|
| 빌드 | **Vite** | Next.js 안 씀 — 이 앱은 로그인 뒤 화면뿐이라 SEO/SSR 이득이 없고, WebRTC·카메라 같은 브라우저 전용 기능이 많아서 SSR이 오히려 방해됨 |
| 언어 | **TypeScript** | 자동완성 + 오타/타입 실수를 컴파일 시점에 잡아줌. 처음엔 귀찮아도 팀 협업에선 필수 |
| 라우팅 | **React Router** | URL ↔ 화면 매핑. `src/app/router.tsx`에 전부 모여있음 |
| **서버 상태** (REST 요청) | **Axios만**  | 이 앱은 대부분 "폼 제출 → 응답 → 다음 화면"이라 캐싱 이점이 적음. 나중에 필요해지면 그때 부분 도입 |
| **클라이언트 상태** | **Zustand** | 로그인 여부, 세션 진행 상태처럼 "여러 컴포넌트가 같이 봐야 하는 값" 저장소. `src/stores/` |
| 폼 | **React Hook Form + Zod** | 입력값 검증(이메일 형식, 필수값 등)을 선언적으로 처리 |
| 스타일 | **Tailwind + BloomTalk 디자인 시스템** | 아래 4번에서 자세히 |

---

## 3. 폴더 구조

```
src/
  app/            라우터, 보호 라우트(로그인 안 하면 튕기는 로직)
  shared/api/     axios 인스턴스, 토큰 저장 (모든 REST 요청은 여기 거쳐감)
  stores/         zustand 전역 상태 (auth / session / coaching)
  features/       화면 단위. 폴더 이름 = 도메인 (auth, home, session ...)
  design-system/  디자인 시스템 원본 CSS (직접 수정 금지, 아래 참고)
```

**새 화면 만들 때:** `features/` 밑에 도메인 폴더 만들고 그 안에 페이지 컴포넌트 작성 → `app/router.tsx`에 경로 추가.

---

## 4. 스타일링 — 이것만은 꼭 지켜라

이 프로젝트는 **Tailwind + BloomTalk 디자인 시스템(`.bt-*`)을 같이 쓰는 하이브리드**다. 처음엔 헷갈릴 수 있는데 규칙은 하나다.

### ✅ 해도 되는 것
```tsx
// 레이아웃(배치)은 Tailwind 유틸리티
<div className="flex items-center gap-4 p-6">

// 완성된 컴포넌트는 .bt-* 클래스 그대로 사용
<button className="bt-btn bt-btn--primary">저장</button>
<div className="bt-card">...</div>
<input className="bt-input" />

// 색은 "브릿지된" Tailwind 유틸 사용 (index.css에서 매핑해둔 것들)
<div className="bg-surface text-ink rounded-xl">
<span className="text-danger">에러 문구</span>
```

### ❌ 하면 안 되는 것
```tsx
// bg-blue-500, text-red-600 같은 Tailwind 기본(raw) 색상 유틸 금지
<button className="bg-blue-500 text-white">  // ❌

// 이유: 디자인 시스템은 라이트/다크 모드를 토큰(변수) 하나로 관리한다.
// raw 색상을 쓰면 그 값이 다크모드에서 안 바뀐다 → 다크 화면에서 색이 깨짐.
```

**왜 이렇게 나눴나:** 디자인팀이 `tokens.css`에 색·간격·모양을 전부 변수(`--bt-color-action` 등)로 정의해뒀고, 그걸 `index.css`에서 Tailwind 쪽에도 연결해놨다. 그래서 `bg-action`이라고 쓰면 실제로는 그 변수 값을 쓰는 거라, 다크모드 전환 시 자동으로 따라간다. `bg-blue-500`은 그 변수를 거치지 않은 고정값이라 안 따라간다.

- 이미 있는 컴포넌트 클래스로 안 되는지 먼저 `src/design-system/components.css`나 `DESIGN_SYSTEM.md`에서 찾아보고, 없을 때만 직접 만들기.
- `src/design-system/*.css` **파일 자체는 수정하지 말 것** — 디자인팀 원본을 복사해온 것. 바꿀 일 있으면 원본(`design-system/` 상위 폴더) 먼저 갱신하고 다시 복사.

---

## 5. 상태 관리 — 언제 뭘 쓰나

헷갈리기 쉬운 부분이라 명확히:

| 상황 | 쓸 것 | 예시 |
|---|---|---|
| 서버에서 가져온 데이터 (한 화면에서만 씀) | `useState` + `useEffect`나 그냥 axios 호출 | 프로필 조회 |
| 여러 화면이 같이 봐야 하는 상태 | `zustand` 스토어 | 로그인 여부(`auth.store`), 세션 진행 상태(`session.store`) |
| ⚠️ **세션 중 실시간 데이터 (WebRTC, 표정 분석, STT 등)** | zustand에 넣지 말고 ref/이벤트로 처리 | 초당 여러 번 바뀌는 데이터를 전역 상태에 넣으면 리렌더링 폭탄 |

`stores/session.store.ts`, `stores/coaching.store.ts` 파일 상단에 이 경고 주석이 이미 달려 있음 — 지우지 말고 참고할 것.

---

## 6. 인증 흐름 (처음 보면 헷갈리는 부분)

1. 로그인 성공 → `useAuthStore().setSession()` 호출 → 토큰을 localStorage에 저장 + 전역 상태 갱신
2. 이후 모든 axios 요청(`shared/api/client.ts`)에 그 토큰이 자동으로 붙음
3. `app/router.tsx`에서 `<ProtectedRoute />`로 감싼 경로는 로그인 안 하면 자동으로 `/login`으로 튕김
4. 서버가 401(인증 만료) 응답하면 자동 로그아웃 처리됨

→ 새로 만드는 화면이 "로그인 필요한 화면"이면 `router.tsx`의 `ProtectedRoute` children 안에 추가.

---

## 7. 자주 헷갈리는 것 (React 처음이면)

- **컴포넌트 = 함수.** `export function LoginPage() { return <div>...</div> }` 처럼 UI를 반환하는 함수가 컴포넌트다.
- **`useState`, `useForm`, `useAuthStore` 같은 `use`로 시작하는 함수 = 훅(Hook).** 컴포넌트 함수 맨 위에서만 호출 가능. `if`문 안이나 반복문 안에서 호출하면 에러남 (React 규칙).
- **`className`이지 `class`가 아니다.** JSX는 HTML이 아니라 JS라서 `class`는 예약어와 충돌.
- **props는 그냥 함수 인자.** `<Button label="저장" />`은 `Button({ label: "저장" })` 호출하는 것과 같다.
- 모르는 에러 나오면 브라우저 콘솔(F12)부터 확인. React가 에러 메시지를 꽤 친절하게 줌.

---

## 8. 커밋 전 체크

```bash
npm run build   # 타입 에러 있으면 여기서 걸러짐 (배포 전 필수)
npm run lint
```

빌드가 로컬에서 통과하면 대부분의 실수는 걸러진 것. `tsc`가 타입 에러 나면 절대 무시하고 넘어가지 말 것 — 나중에 런타임 에러로 터짐.
