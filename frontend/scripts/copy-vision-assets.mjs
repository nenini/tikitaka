/**
 * 표정·시선 분석(COACH-01)에 필요한 로컬 자산을 준비한다. `postinstall` 에서 자동 실행된다.
 *
 *  1. MediaPipe WASM 런타임 → `public/mediapipe/wasm`
 *  2. 얼굴 랜드마커 모델   → `public/models/face_landmarker.task` (없으면 내려받는다)
 *  3. 손 랜드마커 모델     → `public/models/hand_landmarker.task` (없으면 내려받는다)
 *
 * `defaultVisionConfig` 의 `model.modelAssetPath` · `handModel.modelAssetPath` 가 이 경로들을
 * 가리킨다. CDN 을 직접 물리지 않는 이유는 얼굴 분석이 브라우저 로컬 처리 원칙이기도 하고,
 * 시연 환경(터널·오프라인)에서 CDN 이 막히면 세션 중에 분석만 조용히 죽기 때문이다.
 *
 * 모델(합계 약 11.5MB)은 저장소에 넣지 않는다. 새 PC·CI·배포 서버 어디서든 install 한 번으로
 * 갖춰지도록 여기서 받아둔다.
 *
 *   BT_SKIP_VISION_MODEL=1     다운로드를 건너뛴다(오프라인 CI 등)
 *   BT_REQUIRE_VISION_MODEL=1  모델이 하나라도 없으면 **실패로 종료**한다(배포 파이프라인용)
 *
 * ⚠️ 두 모델은 **함께 있어야 한다.** Vision Worker 는 `handModel.enabled` 가 true 면 손 모델
 *    로딩 실패를 `INITIALIZATION_FAILED` 로 올리고, 그러면 표정·시선 분석까지 통째로 죽는다.
 *    운영 배포에서 손 모델만 빠져 분석 전체가 내려간 적이 있어 배포 경로에는
 *    `BT_REQUIRE_VISION_MODEL=1` 을 권한다.
 */
import { cp, mkdir, access, rename, rm, writeFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const wasmSource = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmTarget = resolve(root, 'public/mediapipe/wasm')

/**
 * 내려받을 모델 목록. `minimumBytes` 는 다운로드 중단·디스크 부족으로 잘린 파일을
 * "있다"로 착각하지 않기 위한 하한이며, 실제 크기의 절반쯤으로 잡는다.
 */
const MODELS = [
  {
    label: '얼굴 랜드마커',
    path: resolve(root, 'public/models/face_landmarker.task'),
    relativePath: 'public/models/face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    minimumBytes: 2_000_000, // 실제 약 3.7MB
  },
  {
    label: '손 랜드마커',
    path: resolve(root, 'public/models/hand_landmarker.task'),
    relativePath: 'public/models/hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    minimumBytes: 4_000_000, // 실제 약 7.8MB
  },
]

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function modelReady(model) {
  if (!(await exists(model.path))) return false
  const { size } = await stat(model.path)
  if (size >= model.minimumBytes) return true
  console.warn(`[vision:assets] ${model.label} 모델이 잘려 있습니다(${size}B). 다시 받습니다.`)
  await rm(model.path, { force: true })
  return false
}

async function downloadModel(model) {
  // 같은 디렉토리에 임시로 받고 rename 한다. 중간에 죽어도 잘린 파일이 남지 않는다.
  const temporaryPath = `${model.path}.download`
  const response = await fetch(model.url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength < model.minimumBytes) {
    throw new Error(`받은 파일이 너무 작습니다(${bytes.byteLength}B)`)
  }
  await mkdir(dirname(model.path), { recursive: true })
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, model.path)
  return bytes.byteLength
}

/* ── 1. WASM 런타임 ────────────────────────────────────── */

if (!(await exists(wasmSource))) {
  // 아직 install 전이거나 의존성을 뺀 환경 — postinstall 로 돌 때도 조용히 넘어간다.
  console.warn('[vision:assets] @mediapipe/tasks-vision 이 설치되어 있지 않아 WASM 복사를 건너뜁니다.')
} else {
  await mkdir(dirname(wasmTarget), { recursive: true })
  await cp(wasmSource, wasmTarget, { recursive: true })
  console.log(`[vision:assets] WASM 런타임 복사 완료 → ${wasmTarget}`)
}

/* ── 2. 모델 ───────────────────────────────────────────── */

const skipDownload = process.env.BT_SKIP_VISION_MODEL === '1'
const required = process.env.BT_REQUIRE_VISION_MODEL === '1'
const missing = []

for (const model of MODELS) {
  if (await modelReady(model)) {
    console.log(`[vision:assets] ${model.label} 모델 확인 완료`)
    continue
  }
  if (skipDownload) {
    console.warn(`[vision:assets] BT_SKIP_VISION_MODEL=1 — ${model.label} 다운로드를 건너뜁니다.`)
    missing.push(model)
    continue
  }
  try {
    console.log(`[vision:assets] ${model.label} 모델 다운로드 중… (${model.url})`)
    const size = await downloadModel(model)
    console.log(
      `[vision:assets] ${model.label} 준비 완료 → ${model.relativePath} (${(size / 1024 / 1024).toFixed(1)}MB)`,
    )
  } catch (error) {
    console.warn(
      `[vision:assets] ${model.label} 모델을 받지 못했습니다 (${error instanceof Error ? error.message : error}).\n` +
        `                수동으로 받으려면: curl -L -o ${model.relativePath} ${model.url}`,
    )
    missing.push(model)
  }
}

if (missing.length === 0) {
  console.log('[vision:assets] 모델 준비 완료 — 표정·시선 분석(COACH-01) 사용 가능')
} else {
  // 두 모델 중 하나만 빠져도 Worker 초기화가 통째로 실패한다. 부분 성공을 성공처럼 보이지 않게 한다.
  const names = missing.map((model) => model.label).join(' · ')
  const message =
    `[vision:assets] 모델이 빠졌습니다: ${names}\n` +
    `                표정·시선 분석(COACH-01)은 비활성 상태로 동작합니다.`
  if (required) {
    // 배포 파이프라인 — 분석이 죽은 이미지를 만들어 올리는 것보다 여기서 멈추는 편이 낫다.
    console.error(`${message}\n                BT_REQUIRE_VISION_MODEL=1 이므로 빌드를 중단합니다.`)
    process.exit(1)
  }
  // 로컬·오프라인 — install 을 실패시키지 않는다. 분석은 fail-soft 라 통화는 정상 진행된다.
  console.warn(message)
}
