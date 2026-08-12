import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import { ThemeProvider } from '@/components'
import { useAuthStore } from '@/stores/auth.store'
import { latchDemoCoaching } from '@/features/session/demoCoaching'
import './index.css'

// 시연 코칭 끄기(`?demo=0`)를 탭에 기억시킨다. 라우팅이 시작되기 전에 해야 한다 —
// 세션 화면은 앱 내부 이동으로 들어와 그때는 쿼리가 이미 없다.
latchDemoCoaching()

// 새로고침/재방문 시 저장된 토큰으로 유저 신원을 복원한다(실패하면 조용히 세션 정리).
void useAuthStore.getState().hydrate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 테마 상태의 단일 소스. 여러 위치의 ThemeToggle 이 서로 어긋나지 않는다. */}
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
