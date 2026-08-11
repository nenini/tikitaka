import { createReadStream, existsSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
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

const MEDIAPIPE_WASM_ROUTE = '/mediapipe/wasm/'
const mediapipeWasmDir = fileURLToPath(new URL('./public/mediapipe/wasm', import.meta.url))

const WASM_CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
}

/**
 * MediaPipe WASM 런타임을 dev 서버에서 **변환 없이** 내보낸다.
 *
 * MediaPipe 의 FilesetResolver 는 런타임에
 * `import("/mediapipe/wasm/vision_wasm_module_internal.js")` 를 실행한다.
 * 그런데 vite dev 는 `public/` 안의 파일이 모듈로 import 되면 500 으로 거절한다
 * ("should not be imported from source code"). 그래서 dev 에서는 얼굴 분석이 항상
 * INITIALIZATION_FAILED 로 죽는다 — `vite build` 결과물은 정적 서빙이라 멀쩡해서
 * 빌드만 확인하면 절대 안 잡히는 종류의 버그다.
 *
 * vite 의 transform 미들웨어보다 **먼저** 이 경로를 가로채 원본 바이트를 그대로 돌려준다.
 * (`configureServer` 본문에서 등록하면 내부 미들웨어보다 앞에 선다.)
 * 프로덕션 빌드는 `public/` 이 dist 로 그대로 복사되므로 이 플러그인이 관여하지 않는다.
 */
function mediapipeWasmDevServer(): Plugin {
  return {
    name: 'bt:mediapipe-wasm-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith(MEDIAPIPE_WASM_ROUTE)) return next()

        // 쿼리(`?import` 등)를 떼고, 경로 탈출을 막기 위해 파일명만 쓴다.
        const requested = basename(url.slice(MEDIAPIPE_WASM_ROUTE.length).split('?')[0] ?? '')
        const filePath = join(mediapipeWasmDir, requested)
        if (requested === '' || !existsSync(filePath) || !statSync(filePath).isFile()) {
          return next()
        }

        res.setHeader(
          'Content-Type',
          WASM_CONTENT_TYPES[extname(requested)] ?? 'application/octet-stream',
        )
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // .env(.local) 파일과 OS 환경변수를 모두 로드한다.
  //  - 로컬 단일 PC: 미설정 → localhost:8080
  //  - 크로스-PC(백엔드 다른 PC): frontend/.env 의 VITE_PROXY_TARGET=http://<백엔드_PC_IP>:8080
  //  - docker compose: environment 로 주입되는 VITE_PROXY_TARGET=http://backend:8080
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget =
    env.VITE_PROXY_TARGET || process.env.VITE_PROXY_TARGET || 'http://localhost:8080'

  // 얼굴상 분석 AI 서비스(ai/face-analysis). 백엔드와 별개 프로세스이고,
  // 원본 이미지가 백엔드를 거치지 않도록 프론트가 직접 호출한다.
  // 로컬 docker compose 기준 8001 (컨테이너 내부 8000).
  const aiFaceTarget =
    env.VITE_AI_FACE_TARGET || process.env.VITE_AI_FACE_TARGET || 'http://localhost:8001'

  return {
  plugins: [react(), tailwindcss(), mediapipeWasmDevServer()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@vision': visionDist,
    },
  },
  server: {
    port: 5173,
    // 다른 PC/기기의 브라우저에서 이 dev 서버에 접속할 수 있게 모든 인터페이스에 바인딩
    host: true,
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
      // 얼굴상 분석 AI 서비스. 접두사를 떼고 그대로 넘긴다.
      //   /ai/face/v1/face-analysis/analyze → {aiFaceTarget}/v1/face-analysis/analyze
      '/ai/face': {
        target: aiFaceTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai\/face/, ''),
      },
    },
  },
  }
})
