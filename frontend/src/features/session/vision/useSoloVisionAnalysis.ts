import { useEffect, useRef, useState } from 'react'
import { SystemClock } from '@vision/common/Clock.js'
import { createClientInstanceId } from '@vision/common/ClientInstanceId.js'
import { MonotonicSequenceGenerator } from '@vision/common/SequenceGenerator.js'
import { SessionTimeline } from '@vision/common/SessionTimeline.js'
import { BrowserMediaSource } from '@vision/media/BrowserMediaSource.js'
import { defaultVisionConfig } from '@vision/vision/config/defaultVisionConfig.js'
import { FrameSampler } from '@vision/vision/core/FrameSampler.js'
import { PerformanceGovernor } from '@vision/vision/core/PerformanceGovernor.js'
import { VisionPipeline } from '@vision/vision/core/VisionPipeline.js'
import { VisionSessionRuntime } from '@vision/vision/core/VisionSessionRuntime.js'
import { VisionWorkerClient } from '@vision/vision/core/VisionWorkerClient.js'
import { mediaHealthToQualityRuntime } from '@vision/vision/detectors/FaceQualityDetector.js'
import type { FaceQualityRuntimeStatus } from '@vision/vision/detectors/FaceQualityDetector.js'
import { BufferedVisionEventPublisher } from '@vision/vision/events/VisionEventPublisher.js'
import type { VisionEventTransport } from '@vision/vision/events/VisionEventPublisher.js'
import { VisionEventFactory } from '@vision/vision/events/VisionEventFactory.js'
import type { VisionBehaviorEvent } from '@vision/vision/events/VisionEvent.js'
import type { NormalizedFaceFrame } from '@vision/vision/core/NormalizedFaceFrame.js'
import type { VisionAnalysisStatus } from './useVisionAnalysis'

export interface UseSoloVisionAnalysisOptions {
  /** false 면 파이프라인을 만들지 않는다. 카메라만 켜 두고 분석은 끌 수 있다 */
  readonly enabled: boolean
  /** 로컬 카메라 스트림(getUserMedia). null 이면 시작하지 않는다 */
  readonly stream: MediaStream | null
  /** 이벤트 봉투의 userId. 브라우저 밖으로 나가지 않지만 형식은 지킨다 */
  readonly userId: string | null
  /** 행동 이벤트 콜백. 프레임 단위로 즉시 불린다 */
  readonly onBehavior: (events: readonly VisionBehaviorEvent[]) => void
}

/**
 * **혼자 연습(AI 화상)** 용 표정·시선 분석.
 *
 * `useVisionAnalysis` 와 같은 파이프라인을 쓰지만 **네트워크가 없다.**
 * 세 가지가 다르다.
 *
 *  1. LiveKit 룸도, AI 워커도 요구하지 않는다 — 혼자 연습에는 상대가 없다.
 *     (본편은 워커가 룸에 들어와야 시작한다. 여기서 그 게이트를 그대로 쓰면 영원히 안 돈다.)
 *  2. Transport 가 **아무 데도 보내지 않는다.** 지표조차 브라우저를 떠나지 않는다.
 *     서버에 이 연습을 받을 세션이 없기도 하고, 없는 세션 id 로 이벤트를 쏘면
 *     수신 측이 거절할 뿐이다.
 *  3. 코칭을 `publisher` 가 아니라 **프레임 결과에서 바로** 뽑는다. 배치 지연(수 초)을
 *     기다리면 "지금 웃고 있다"는 신호가 늦어 쓸모가 없다.
 *
 * ⚠️ 서버 세션이 생기면 이 훅이 아니라 `useVisionAnalysis` 를 써야 한다 —
 *    리포트·성장 지표는 서버가 받은 이벤트로만 만들어진다.
 */
export function useSoloVisionAnalysis(
  options: UseSoloVisionAnalysisOptions,
): VisionAnalysisStatus {
  const { enabled, stream, userId, onBehavior } = options

  const [status, setStatus] = useState<VisionAnalysisStatus>({ state: 'IDLE', error: null })

  // effect 를 다시 돌리지 않고 최신 콜백을 쓰기 위해 ref 로 읽는다.
  const onBehaviorRef = useRef(onBehavior)
  onBehaviorRef.current = onBehavior

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mediaSourceRef = useRef<BrowserMediaSource | null>(null)

  const ready = enabled && stream !== null

  /* ── 분석 전용 video 엘리먼트 ──
     DOM 에 붙어 있어야 브라우저가 프레임을 넘겨준다(display:none 이면 rVFC 가 멈춘다).
     화면의 미리보기를 재사용하지 않는 이유는 본편과 같다 — 그쪽은 레이아웃에 따라
     언마운트될 수 있고, 그러면 샘플러가 죽은 엘리먼트를 잡는다. */
  useEffect(() => {
    if (!ready) return
    const element = document.createElement('video')
    element.muted = true
    element.autoplay = true
    element.playsInline = true
    element.setAttribute('aria-hidden', 'true')
    Object.assign(element.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '2px',
      height: '2px',
      opacity: '0.01',
      pointerEvents: 'none',
      zIndex: '-1',
    } satisfies Partial<CSSStyleDeclaration>)
    document.body.appendChild(element)
    videoRef.current = element

    return () => {
      videoRef.current = null
      element.srcObject = null
      element.remove()
    }
  }, [ready])

  /* ── 카메라 스트림을 분석 엘리먼트에 붙인다 ── */
  useEffect(() => {
    const element = videoRef.current
    if (!ready || element === null || stream === null) return

    element.srcObject = stream
    void element.play().catch(() => undefined)
    const mediaSource = new BrowserMediaSource(stream)
    mediaSourceRef.current = mediaSource

    return () => {
      mediaSourceRef.current = null
      // dispose 는 관찰만 끊는다 — 스트림은 화면이 소유하므로 여기서 stop 하지 않는다.
      mediaSource.dispose()
      element.srcObject = null
    }
  }, [ready, stream])

  /* ── 파이프라인 ── */
  useEffect(() => {
    if (!ready) {
      setStatus({ state: 'IDLE', error: null })
      return
    }
    const element = videoRef.current
    if (element === null) return

    let disposed = false
    setStatus({ state: 'STARTING', error: null })

    const clock = new SystemClock()
    // 혼자 연습은 시작 시점이 곧 0 이다 — 서버와 맞출 기준점이 없다.
    const timeline = new SessionTimeline(
      { sessionElapsedMsAtSync: 0, clientMonotonicMsAtSync: clock.monotonicNowMs() },
      clock,
    )
    const eventFactory = new VisionEventFactory(
      {
        sessionId: SOLO_SESSION_ID,
        userId: userId ?? SOLO_USER_ID,
        clientInstanceId: createClientInstanceId(),
      },
      {
        modelVersion: defaultVisionConfig.model.modelVersion,
        ruleVersion: defaultVisionConfig.model.ruleVersion,
      },
      timeline,
      clock,
      new MonotonicSequenceGenerator(),
      () => crypto.randomUUID(),
    )
    const pipeline = new VisionPipeline(defaultVisionConfig, eventFactory)
    // publisher 는 파이프라인이 요구해서 둘 뿐이다. 실제로 나가는 곳은 없다.
    const publisher = new BufferedVisionEventPublisher(
      DISCARDING_TRANSPORT,
      defaultVisionConfig,
      clock,
    )
    const governor = new PerformanceGovernor(defaultVisionConfig)

    // Worker 는 반드시 이 한 줄 그대로 둔다 — vite 는 `new Worker(new URL(...), ...)`
    // 패턴을 정적으로 찾아 번들한다. 변수로 빼면 개발 모드에서만 동작한다.
    const worker = new Worker(new URL('./vision.worker.ts', import.meta.url), {
      type: 'module',
    })

    let runtime: VisionSessionRuntime | null = null

    const runtimeStatusOf = (): FaceQualityRuntimeStatus => {
      const health = mediaSourceRef.current?.getHealth() ?? null
      return {
        ...(health === null
          ? { cameraEnabled: false, trackEnded: false }
          : mediaHealthToQualityRuntime(health)),
        videoDimensionsAvailable: element.videoWidth > 0 && element.videoHeight > 0,
        tabVisible: document.visibilityState === 'visible',
        landmarkerAvailable: true,
        workerHealthy: true,
      }
    }

    const onFrameResult = (frame: NormalizedFaceFrame): void => {
      if (disposed || runtime === null || runtime.getState() !== 'ACTIVE') return
      void runtime
        .process(frame, runtimeStatusOf())
        .then((result) => {
          if (disposed) return
          const events = result.pipeline.behaviorEvents
          if (events.length > 0) onBehaviorRef.current(events)
        })
        .catch(() => undefined)
    }

    let sampler: FrameSampler | null = null
    const client = new VisionWorkerClient(worker, onFrameResult, (error) => {
      if (disposed) return
      sampler?.stop()
      setStatus({ state: 'UNAVAILABLE', error: error.message })
    })

    sampler = new FrameSampler(
      element,
      client,
      timeline,
      clock,
      undefined,
      defaultVisionConfig.profiles.HIGH.targetFps,
      'HIGH',
      () => {
        /* 한 프레임 캡처 실패는 다음 프레임에서 회복된다 */
      },
    )

    const activeSampler = sampler
    runtime = new VisionSessionRuntime(pipeline, publisher, governor, activeSampler, [
      { dispose: () => client.dispose() },
    ])
    const activeRuntime = runtime

    void client
      .initialize(defaultVisionConfig)
      .then(() => {
        if (disposed) return
        activeSampler.start()
        setStatus({ state: 'RUNNING', error: null })
      })
      .catch((error: unknown) => {
        if (disposed) return
        // 모델(.task)·WASM 이 없으면 여기로 온다. 분석만 포기하고 연습은 그대로 둔다.
        setStatus({
          state: 'UNAVAILABLE',
          error: error instanceof Error ? error.message : 'Vision Worker 초기화 실패',
        })
      })

    return () => {
      disposed = true
      activeSampler.stop()
      // 보낼 곳이 없으므로 flush 여부는 의미가 없다. 자원만 정리한다.
      void activeRuntime
        .end('SESSION_ENDED', {
          sessionElapsedMs: timeline.now().sessionElapsedMs,
          clientMonotonicMs: clock.monotonicNowMs(),
        })
        .catch(() => undefined)
        .finally(() => worker.terminate())
      setStatus({ state: 'IDLE', error: null })
    }
  }, [ready, userId])

  return status
}

/**
 * 서버 세션이 아니라는 것을 값 자체로 드러낸다. 숫자 id 를 쓰면 실수로 전송 경로에
 * 물렸을 때 **남의 세션에 섞여 들어갈 수 있다.**
 */
const SOLO_SESSION_ID = 'solo-practice'
const SOLO_USER_ID = 'solo'

/** 아무 데도 보내지 않는 transport. 지표조차 브라우저를 떠나지 않는다. */
const DISCARDING_TRANSPORT: VisionEventTransport = {
  send: () => Promise.resolve(),
}
