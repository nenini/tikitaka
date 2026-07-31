/**
 * MediaPipe WASM 런타임을 `public/mediapipe/wasm` 으로 복사한다.
 *
 * `defaultVisionConfig.model.wasmBasePath` 가 `/mediapipe/wasm` 이라, Worker 는 이 경로에서
 * 런타임을 내려받는다. CDN 을 쓰지 않는 이유는 두 가지다.
 *  - 얼굴 분석은 브라우저 로컬 처리가 원칙이라 외부 요청을 늘리고 싶지 않다.
 *  - 시연 환경(터널·오프라인)에서 CDN 이 막히면 세션 중에 분석만 조용히 죽는다.
 *
 * 모델 파일(`public/models/face_landmarker.task`)은 용량이 커서 저장소에 넣지 않는다.
 * 없으면 경고만 남기고 통과한다 — 빌드는 실패시키지 않는다(분석은 fail-soft 다).
 */
import { cp, mkdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const wasmSource = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmTarget = resolve(root, 'public/mediapipe/wasm')
const modelPath = resolve(root, 'public/models/face_landmarker.task')

const MODEL_DOWNLOAD_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

if (!(await exists(wasmSource))) {
  // 아직 install 전이거나 의존성을 뺀 환경 — postinstall 로 돌 때도 조용히 넘어간다.
  console.warn('[vision:assets] @mediapipe/tasks-vision 이 설치되어 있지 않아 WASM 복사를 건너뜁니다.')
} else {
  await mkdir(dirname(wasmTarget), { recursive: true })
  await cp(wasmSource, wasmTarget, { recursive: true })
  console.log(`[vision:assets] WASM 런타임 복사 완료 → ${wasmTarget}`)
}

if (!(await exists(modelPath))) {
  console.warn(
    `[vision:assets] 얼굴 랜드마커 모델이 없습니다. 표정·시선 분석(COACH-01)은 비활성 상태로 동작합니다.\n` +
      `                받는 곳: ${MODEL_DOWNLOAD_URL}\n` +
      `                두는 곳: public/models/face_landmarker.task`,
  )
}
