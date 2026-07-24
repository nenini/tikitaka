import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { HomePage } from '@/features/home/HomePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { VerifyKycPage, ForgotPasswordPage } from '@/features/auth/AuthPlaceholder'
import { SessionPage } from '@/features/session/SessionPage'
import { ComponentGallery } from '@/features/dev/ComponentGallery'

/**
 * 앱 라우팅. 기능이 확정되면 각 feature 폴더에 페이지를 추가한다.
 * 공개 라우트(가입/로그인) vs 보호 라우트(그 외)로 분리.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/signup/verify', element: <VerifyKycPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  // 공용 컴포넌트 갤러리 (개발/디자인 QA 전용, 인증 불필요)
  { path: '/gallery', element: <ComponentGallery /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/session/:sessionId', element: <SessionPage /> },
      // TODO: /profile, /matching, /chatbot, /report/:id, /dashboard, /contact ...
    ],
  },
])
