import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env(.local) 파일과 OS 환경변수를 모두 로드한다.
  //  - 로컬 단일 PC: 미설정 → localhost:8080
  //  - 크로스-PC(백엔드 다른 PC): frontend/.env 의 VITE_PROXY_TARGET=http://<백엔드_PC_IP>:8080
  //  - docker compose: environment 로 주입되는 VITE_PROXY_TARGET=http://backend:8080
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || process.env.VITE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // 다른 PC의 브라우저에서 이 dev 서버에 접속할 수 있게 모든 인터페이스에 바인딩
      host: true,
      proxy: {
        // 개발 중 백엔드 REST/WS 프록시 (서버측 포워딩이라 브라우저 CORS 불필요)
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          // 브라우저 Origin 을 제거해 백엔드 CORS 필터가 non-CORS(curl 동등)로 처리하게 한다.
          // (크로스-PC dev 에서 백엔드 CORS 허용목록에 이 origin 이 없어도 통과)
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin')
            })
          },
        },
        '/ws': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
