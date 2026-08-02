/**
 * 표정·시선 분석(COACH-01)에 필요한 로컬 자산을 준비한다. `postinstall` 에서 자동 실행된다.
 *
 *  1. MediaPipe WASM 런타임 → `public/mediapipe/wasm`
 *  2. 얼굴 랜드마커 모델   → `public/models/face_landmarker.task` (없으면 내려받는다)
 *
 * `defaultVisionConfig.model` 이 이 두 경로를 가리킨다. CDN 을 직접 물리지 않는 이유는
 * 얼굴 분석이 브라우저 로컬 처리 원칙이기도 하고, 시연 환경(터널·오프라인)에서 CDN 이
 * 막히면 세션 중에 분석만 조용히 죽기 때문이다.
 *
 * 모델(3.7MB)은 저장소에 넣지 않는다. 새 PC·CI·배포 서버 어디서든 install 한 번으로
 * 갖춰지도록 여기서 받아둔다. 네트워크가 막힌 환경에서도 **install 을 실패시키지 않는다** —
 * 분석은 fail-soft 라 모델이 없으면 통화만 정상 진행되고 분석이 꺼진다.
 *
 *   BT_SKIP_VISION_MODEL=1  다운로드를 건너뛴다(오프라인 CI 등)
 */
import { cp, mkdir, access, rename, rm, writeFile, stat } from 'node:fs/promises'
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

/** 다운로드 중단·디스크 부족으로 잘린 파일을 "있다"로 착각하지 않게 크기도 본다. */
const MODEL_MINIMUM_BYTES = 1_000_000

async function modelReady() {
  if (!(await exists(modelPath))) return false
  const { size } = await stat(modelPath)
  if (size >= MODEL_MINIMUM_BYTES) return true
  console.warn(`[vision:assets] 모델 파일이 잘려 있습니다(${size}B). 다시 받습니다.`)
  await rm(modelPath, { force: true })
  return false
}

async function downloadModel() {
  // 같은 디렉토리에 임시로 받고 rename 한다. 중간에 죽어도 잘린 파일이 남지 않는다.
  const temporaryPath = `${modelPath}.download`
  const response = await fetch(MODEL_DOWNLOAD_URL)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength < MODEL_MINIMUM_BYTES) {
    throw new Error(`받은 파일이 너무 작습니다(${bytes.byteLength}B)`)
  }
  await mkdir(dirname(modelPath), { recursive: true })
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, modelPath)
  return bytes.byteLength
}

if (await modelReady()) {
  console.log('[vision:assets] 얼굴 랜드마커 모델 확인 완료')
} else if (process.env.BT_SKIP_VISION_MODEL === '1') {
  console.warn('[vision:assets] BT_SKIP_VISION_MODEL=1 — 모델 다운로드를 건너뜁니다.')
} else {
  try {
    console.log(`[vision:assets] 얼굴 랜드마커 모델 다운로드 중… (${MODEL_DOWNLOAD_URL})`)
    const size = await downloadModel()
    console.log(
      `[vision:assets] 모델 준비 완료 → public/models/face_landmarker.task (${(size / 1024 / 1024).toFixed(1)}MB)`,
    )
  } catch (error) {
    // 설치를 실패시키지 않는다. 모델이 없으면 분석만 UNAVAILABLE 로 떨어지고 통화는 정상이다.
    console.warn(
      `[vision:assets] 모델을 받지 못했습니다 (${error instanceof Error ? error.message : error}).\n` +
        `                표정·시선 분석(COACH-01)은 비활성 상태로 동작합니다.\n` +
        `                수동으로 받으려면: curl -L -o public/models/face_landmarker.task ${MODEL_DOWNLOAD_URL}`,
    )
  }
}
