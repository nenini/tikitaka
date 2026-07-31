import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
/**
 * AI 파트가 만든 브라우저 로컬 분석 패키지(`ai/vision-analysis`).
 *
 * **소스가 아니라 빌드 산출물(dist)** 을 물린다. 소스를 직접 번들하면 이 프로젝트의
 * tsconfig(`erasableSyntaxOnly`·`noUnusedLocals`·비-strict)가 AI 패키지 소스에 그대로
 * 적용되어 `tsc -b` 가 남의 코드에서 터진다 — 패키지는 자기 tsconfig 로 빌드하고
 * FE 는 .d.ts 만 읽는 게 맞다.
 *
 *   빌드: `npm run vision:build` (ai/vision-analysis 에서 `npm install` 이 선행돼야 한다)
 */
const visionPackage = fileURLToPath(new URL('../ai/vision-analysis', import.meta.url))
const visionDist = `${visionPackage}/dist`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@vision': visionDist,
    },
  },
  server: {
    port: 5173,
    fs: {
      // 프로젝트 루트 밖(ai/vision-analysis)을 읽어야 dev 서버가 파일을 서빙한다.
      allow: [fileURLToPath(new URL('.', import.meta.url)), visionPackage],
    },
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
