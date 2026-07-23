# 프로젝트: 화상소개팅 (S15P11A307) — 프론트엔드

## 작업 범위
- **`S15P11A307/frontend` 폴더에서만 작업.** `backend`, `ai`, `기획산출물` 등 나머지는 절대 건드리지 않는다.

## 담당자: FE-B (실시간·AI·매칭)
다른 팀원(FE-A)이 담당하는 영역은 최대한 건드리지 말고, 불가피하게 손대야 하면 반드시 사용자에게 먼저 알린다.

### FE-B 담당 화면
- 온보딩: W-05 얼굴촬영, W-05b 얼굴상, W-06 설문
- 매칭: W-08 홈, W-08b 트랙선택, W-09 매칭카드, W-09b 대기큐
- 세션: W-11 대기방(기기점검), W-12 화상세션(WebRTC+코칭), W-13 신고
- 세션 후: W-14 평가, W-15 5분연장, W-16 리포트(레이더차트), W-17 성장대시보드
- 챗봇/AI화상: W-10·10b 챗봇, W-21~24 AI 화상
- 횡단 관심사: WebSocket/STOMP, WebRTC, Chart.js, 실시간 상태동기화

### FE-A 담당 화면 (건드리지 말 것)
- 온보딩: W-01 로그인/랜딩, W-02 계정만들기, W-02b 본인인증(KYC), W-04 기본프로필
- 매칭: W-18 알림센터
- 계정관리: W-19 마이페이지, W-19b 개인정보 수정·관리, AUTH-03 동의관리
- 관리자: W-40 대시보드, W-41 신고·회원관리, W-42 정책설정
- 횡단 관심사: 폼검증(RHF+Zod), 웹 접근성(WCAG/KWCAG), 권한 라우팅, 토큰/세션 보안

## 기술 스택 (frontend/package.json 기준)
- React 19 + TypeScript + Vite 8
- Tailwind CSS v4 (@tailwindcss/vite)
- Zustand (상태관리), React Router 7
- React Hook Form + Zod + @hookform/resolvers (폼검증 — 주로 FE-A 영역이지만 공용 유틸일 수 있음)
- Axios (HTTP)
- Lint: oxlint / Format: prettier
