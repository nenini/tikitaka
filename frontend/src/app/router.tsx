import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { HomePage } from '@/features/home/HomePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { SessionPage } from '@/features/session/SessionPage'

/**
 * 앱 라우팅. 기능이 확정되면 각 feature 폴더에 페이지를 추가한다.
 * 공개 라우트(가입/로그인) vs 보호 라우트(그 외)로 분리.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/session/:sessionId', element: <SessionPage /> },
      // TODO: /profile, /matching, /chatbot, /report/:id, /dashboard, /contact ...
    ],
  },
])
