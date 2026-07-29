import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AppShell } from './AppShell'
import { ComingSoon } from './ComingSoon'
import { HomePage } from '@/features/home/HomePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { VerifyKycPage } from '@/features/auth/VerifyKycPage'
import { ConsentPage } from '@/features/auth/ConsentPage'
import { ProfilePage } from '@/features/auth/ProfilePage'
import { SurveyPage, ForgotPasswordPage } from '@/features/auth/AuthPlaceholder'
import { MyPage, ConsentManagePage, AccountEditPage } from '@/features/account/MyPage'
import { SessionPage } from '@/features/session/SessionPage'
import { ComponentGallery } from '@/features/dev/ComponentGallery'

/**
 * 앱 라우팅.
 * - 공개 라우트(가입/로그인) vs 보호 라우트(그 외)로 분리.
 * - 보호 라우트 중 top-level 화면(홈/매칭/리포트/성장/마이)은 공유 AppShell(상단·하단 네비) 안에 둔다.
 * - 세션(WebRTC·다크 고정)처럼 몰입형 화면은 셸 밖에 둔다.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/signup/verify', element: <VerifyKycPage /> },
  { path: '/signup/consent', element: <ConsentPage /> },
  { path: '/signup/profile', element: <ProfilePage /> },
  { path: '/signup/survey', element: <SurveyPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
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
          { path: '/me/edit', element: <AccountEditPage /> },
        ],
      },
      // ── 몰입형(다크 고정) — 셸 밖 ──
      { path: '/session/:sessionId', element: <SessionPage /> },
    ],
  },
])
