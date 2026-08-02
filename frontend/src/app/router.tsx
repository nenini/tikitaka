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
import { MyPage } from '@/features/account/MyPage'
import { ConsentManagePage } from '@/features/account/ConsentManagePage'
import {
  AccountEditPage,
  FaceRecapturePage,
  SurveyEditPage,
  ProfileEditPage,
  RegionEditPage,
} from '@/features/account/AccountEditPage'
import { SessionPage } from '@/features/session/SessionPage'
import { ComponentGallery } from '@/features/dev/ComponentGallery'
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
 * - 세션(WebRTC·다크 고정)처럼 몰입형 화면은 셸 밖에 둔다.
 */
export const router = createBrowserRouter([
  // 서비스 첫 진입 화면 — 3초 후(또는 START 클릭 시) 인증 상태에 따라 홈/로그인으로 이동
  { path: '/splash', element: <SplashPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/signup/verify', element: <VerifyKycPage /> },
  { path: '/signup/consent', element: <ConsentPage /> },
  { path: '/signup/profile', element: <ProfilePage /> },
  { path: '/signup/survey', element: <SurveyPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  // 소셜 로그인 콜백 — 백엔드가 토큰을 해시로 실어 이 라우트로 302 리다이렉트한다
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
          { path: '/matching', element: <ComingSoon title="매칭" /> },
          { path: '/reports', element: <ComingSoon title="리포트" /> },
          { path: '/growth', element: <ComingSoon title="성장" /> },
          { path: '/me', element: <MyPage /> },
          { path: '/me/consent', element: <ConsentManagePage /> },
          // 개인정보 수정·관리(W-19b) 허브 + 항목별 별도 편집 화면(이번 차수 스텁)
          { path: '/me/edit', element: <AccountEditPage /> },
          { path: '/me/edit/face', element: <FaceRecapturePage /> },
          { path: '/me/edit/survey', element: <SurveyEditPage /> },
          { path: '/me/edit/profile', element: <ProfileEditPage /> },
          { path: '/me/edit/region', element: <RegionEditPage /> },
        ],
      },
      // ── 몰입형(다크 고정) — 셸 밖 ──
      { path: '/session/:sessionId', element: <SessionPage /> },
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
