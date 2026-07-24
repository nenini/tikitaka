import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import { ThemeProvider } from '@/components'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 테마 상태의 단일 소스. 여러 위치의 ThemeToggle 이 서로 어긋나지 않는다. */}
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
