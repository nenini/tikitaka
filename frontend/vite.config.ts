import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    /**
     * 시연용 터널 허용 (MVP 데모).
     *
     * WebRTC 의 `getUserMedia` 는 secure context 에서만 동작한다 —
     * 둘째 기기가 `http://192.168.x.x:5173` 로 들어오면 카메라가 아예 열리지 않는다.
     * 그래서 `cloudflared tunnel --url http://localhost:5173` 로 https 주소를 뽑아 쓰는데,
     * vite 는 모르는 Host 헤더를 기본으로 막으므로 그 도메인을 열어준다.
     */
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      // 개발 중 백엔드 REST/WS 프록시 (BE 주소 확정되면 target 조정)
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
