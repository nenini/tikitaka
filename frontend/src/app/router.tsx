import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AppShell } from './AppShell'
import { ComingSoon } from './ComingSoon'
import { HomePage } from '@/features/home/HomePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { SplashPage } from '@/features/auth/SplashPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { VerifyKycPage } from '@/features/auth/VerifyKycPage'
import { ConsentPage } from '@/features/auth/ConsentPage'
import { ProfilePage } from '@/features/auth/ProfilePage'
import { SurveyPage, ForgotPasswordPage } from '@/features/auth/AuthPlaceholder'
import { OAuthCallbackPage } from '@/features/auth/OAuthCallbackPage'
// 계정(#28) — 마이 · 동의 관리 · 개인정보 수정 허브
import { MyPage } from '@/features/account/MyPage'
import { ConsentManagePage } from '@/features/account/ConsentManagePage'
import {
  AccountEditPage,
  SurveyEditPage,
  ProfileEditPage,
  RegionEditPage,
} from '@/features/account/AccountEditPage'
// 얼굴상 분석(W-05 / W-19b) — 온보딩 촬영과 재촬영이 같은 화면을 모드로 나눠 쓴다
import { FaceCapturePage, FaceRecapturePage } from '@/features/face/FaceCapturePage'
// 세션 · 대기방
import { SessionPage } from '@/features/session/SessionPage'
import { WaitingRoomPage } from '@/features/room/WaitingRoomPage'
// 매칭 F2
import { TrackSelectPage } from '@/features/matching/TrackSelectPage'
import { MatchQueuePage } from '@/features/matching/MatchQueuePage'
import { MatchCardPage } from '@/features/matching/MatchCardPage'
// AI 챗봇 F5
import { ChatPage } from '@/features/chatbot/ChatPage'
import { ChatReportPage } from '@/features/chatbot/ChatReportPage'
import { PersonaSetupPage } from '@/features/chatbot/PersonaSetupPage'
// 세션 후 F4
import { PeerReviewPage } from '@/features/result/PeerReviewPage'
import { SessionReportPage } from '@/features/report/SessionReportPage'
import { GrowthDashboardPage } from '@/features/growth/GrowthDashboardPage'
// 개발/QA 전용
import { ComponentGallery } from '@/features/dev/ComponentGallery'
import { LiveKitDemoPage } from '@/features/session/LiveKitDemoPage'
// 관리자(#34)
import { AdminProtectedRoute } from './AdminProtectedRoute'
import { AdminShell } from '@/features/admin/AdminShell'
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage'
import { ReportsAdminPage } from '@/features/admin/ReportsAdminPage'
import { PolicyAdminPage } from '@/features/admin/PolicyAdminPage'
import { AdminPlaceholder } from '@/features/admin/AdminPlaceholder'

/**
 * 앱 라우팅.
 * - 공개 라우트(가입/로그인) vs 보호 라우트(그 외)로 분리.
 * - 보호 라우트 중 top-level 화면(홈/매칭/리포트/성장/마이)은 공유 AppShell(상단·하단 네비) 안에 둔다.
 * - 세션(WebRTC·다크 고정)·대기방·챗봇처럼 몰입형 화면은 셸 밖에 둔다.
 * - 관리자(/admin)는 ADMIN 롤 가드 + 전용 셸을 따로 쓴다.
 */
export const router = createBrowserRouter([
  // 서비스 첫 진입 화면 — 3초 후(또는 START 클릭 시) 인증 상태에 따라 홈/로그인으로 이동
  { path: '/splash', element: <SplashPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/signup/verify', element: <VerifyKycPage /> },
  { path: '/signup/consent', element: <ConsentPage /> },
  { path: '/signup/profile', element: <ProfilePage /> },
  { path: '/signup/face', element: <FaceCapturePage /> },
  { path: '/signup/survey', element: <SurveyPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  // OAuth 콜백 수신(공개) — 백엔드가 302로 토큰을 URL 프래그먼트에 실어 되돌려보낸다
  { path: '/oauth/callback', element: <OAuthCallbackPage /> },
  // 공용 컴포넌트 갤러리 (개발/디자인 QA 전용, 인증 불필요)
  { path: '/gallery', element: <ComponentGallery /> },
  {
    element: <ProtectedRoute />,
    children: [
      // ── 공유 앱 셸(상단/하단 네비) 안의 top-level 화면 ──
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          // 매칭 F2 진입점 — 트랙 선택. 이후 큐/카드는 몰입 흐름이라 셸 밖.
          { path: '/matching', element: <TrackSelectPage /> },
          // AppShell 네비의 '리포트' 목적지. 세션별 리포트는 있으나 목록 화면은 아직 없음.
          // TODO(FE): 리포트 목록 화면 생기면 ComingSoon 교체.
          { path: '/reports', element: <ComingSoon title="리포트" /> },
          { path: '/growth', element: <GrowthDashboardPage /> },
          // 마이 · 동의 관리(AUTH-03)
          { path: '/me', element: <MyPage /> },
          { path: '/me/consent', element: <ConsentManagePage /> },
          // 개인정보 수정·관리(W-19b) 허브 + 항목별 별도 편집 화면
          { path: '/me/edit', element: <AccountEditPage /> },
          { path: '/me/edit/face', element: <FaceRecapturePage /> },
          { path: '/me/edit/survey', element: <SurveyEditPage /> },
          { path: '/me/edit/profile', element: <ProfileEditPage /> },
          { path: '/me/edit/region', element: <RegionEditPage /> },
        ],
      },

      // ── 몰입형 · 흐름 화면 (셸 밖) ──
      // 매칭 F2 흐름: 대기 큐 → 매칭 카드 → (수락) 대기방
      { path: '/matching/queue/:requestId', element: <MatchQueuePage /> },
      { path: '/matching/pair/:pairId', element: <MatchCardPage /> },
      // 대기방(기기 점검) → 세션. 대기방을 거쳐 WebRTC 세션으로 진입한다.
      { path: '/session/:sessionId/room', element: <WaitingRoomPage /> },
      { path: '/session/:sessionId', element: <SessionPage /> },
      // 세션 후 F4: 상호 평가 W-14 → AI 세션 리포트 W-16
      { path: '/session/:sessionId/review', element: <PeerReviewPage /> },
      { path: '/session/:sessionId/report', element: <SessionReportPage /> },
      // AI 챗봇 F5: 페르소나 설정 W-10 → 대화 W-10b → 종료 시 종합 피드백.
      // `/chatbot` 은 진행 중 세션으로 해석된다.
      { path: '/chatbot/persona', element: <PersonaSetupPage /> },
      { path: '/chatbot', element: <ChatPage /> },
      { path: '/chatbot/:chatSessionId', element: <ChatPage /> },
      { path: '/chatbot/:chatSessionId/report', element: <ChatReportPage /> },
      // TODO(FE-B 다음 배치): /ai-video/setup(W-21) · W-13 신고 전용 화면 · W-18 알림 ...

      //-----------
      // 개발용, 추후 삭제
      { path: '/livekit-demo', element: <LiveKitDemoPage /> },
    ],
  },

  // ── 관리자(ADMIN 롤 전용) — 별도 가드 + 관리자 셸(좌측 사이드바) ──
  {
    element: <AdminProtectedRoute />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { path: '/admin', element: <AdminDashboardPage /> },
          { path: '/admin/reports', element: <ReportsAdminPage /> },
          { path: '/admin/policy', element: <PolicyAdminPage /> },
          // 사이드바에 있으나 이번 차수 목업 없는 화면 — 스텁
          { path: '/admin/members', element: <AdminPlaceholder title="회원 관리" /> },
          { path: '/admin/presets', element: <AdminPlaceholder title="사전 데이터" /> },
          { path: '/admin/analytics', element: <AdminPlaceholder title="리포트" /> },
        ],
      },
    ],
  },
])
