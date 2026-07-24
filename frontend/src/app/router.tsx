import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { HomePage } from '@/features/home/HomePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { SessionPage } from '@/features/session/SessionPage'
import { WaitingRoomPage } from '@/features/room/WaitingRoomPage'
import { TrackSelectPage } from '@/features/matching/TrackSelectPage'
import { MatchQueuePage } from '@/features/matching/MatchQueuePage'
import { MatchCardPage } from '@/features/matching/MatchCardPage'
import { ComponentGallery } from '@/features/dev/ComponentGallery'

/**
 * 앱 라우팅. 기능이 확정되면 각 feature 폴더에 페이지를 추가한다.
 * 공개 라우트(가입/로그인) vs 보호 라우트(그 외)로 분리.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // 공용 컴포넌트 갤러리 (개발/디자인 QA 전용, 인증 불필요)
  { path: '/gallery', element: <ComponentGallery /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <HomePage /> },
      // 매칭 F2: 트랙 선택 → 대기 큐 → 매칭 카드 → (수락) 대기방
      { path: '/matching', element: <TrackSelectPage /> },
      { path: '/matching/queue/:requestId', element: <MatchQueuePage /> },
      { path: '/matching/pair/:pairId', element: <MatchCardPage /> },
      // 대기방(기기 점검) → 세션. 대기방을 거쳐 WebRTC 세션으로 진입한다.
      { path: '/session/:sessionId/room', element: <WaitingRoomPage /> },
      { path: '/session/:sessionId', element: <SessionPage /> },
      // TODO(FE-B 다음 배치): /ai-video/setup(W-21), /chatbot/persona(W-10) · /report/:id, /dashboard, /contact ...

      { path: '/dev', element: <ComponentGallery /> }
    ],
  },
])
