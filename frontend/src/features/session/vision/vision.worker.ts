/**
 * Vision Worker 진입점.
 *
 * 실제 구현은 AI 파트 패키지에 있고 여기서는 vite 가 번들할 수 있게 한 번 감싸기만 한다.
 * 패키지의 `createBundledVisionWorkerClient()` 를 쓰지 않는 이유: 그쪽은 Worker 를 패키지
 * 안에서 만들기 때문에, 호출 지점이 `new Worker(new URL(...), ...)` 형태여야 정적으로
 * 잡아내는 vite 의 워커 번들링이 걸리지 않는다.
 */
import '@vision/vision/workers/vision.worker.js'
