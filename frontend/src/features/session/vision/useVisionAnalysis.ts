import { useEffect, useRef, useState } from 'react'
import type { LocalVideoTrack, Room } from 'livekit-client'
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
import { VisionEventFactory } from '@vision/vision/events/VisionEventFactory.js'
import type { NormalizedFaceFrame } from '@vision/vision/core/NormalizedFaceFrame.js'
import {
  LiveKitVisionTransport,
  aiWorkerIdentityOf,
  participantIdentityOf,
} from './LiveKitVisionTransport'

export type VisionAnalysisState =
  /** 아직 조건이 안 갖춰졌다(동의 없음·세션 미시작·룸 미연결) */
  | 'IDLE'
  /** Worker 초기화 중 */
  | 'STARTING'
  /** 프레임을 분석하고 배치를 내보내는 중 */
  | 'RUNNING'
  /** 모델·WASM·GPU 문제로 이 기기에서는 분석할 수 없다. 통화는 그대로 진행된다 */
  | 'UNAVAILABLE'

export interface VisionAnalysisStatus {
  readonly state: VisionAnalysisState
  /** 로컬 진단용 메시지. 사용자에게 그대로 보여주지 않는다 */
  readonly error: string | null
}

export interface UseVisionAnalysisOptions {
  /**
   * 표정 분석 동의(`expressionAnalysisEnabled`). false 면 분석도 전송도 하지 않고,
   * 진행 중이었다면 **동의 철회로 간주해** 버퍼를 flush 하지 않고 버린다.
   */
  readonly visionEnabled: boolean
  /** 연결이 끝난 LiveKit 룸. null 이면 시작하지 않는다 */
  readonly room: Room | null
  /** 내 카메라 트랙. 카메라를 끄면 null 이 되고, 다시 켜면 새 인스턴스가 온다 */
  readonly localVideo: LocalVideoTrack | null
  readonly sessionId: number
  /** 현재 로그인 사용자 id. 이벤트 봉투의 userId 가 된다 */
  readonly userId: string | null
  /** 내 LiveKit participant identity */
  readonly participantIdentity: string | null
  /** 세션 실제 시작 시각(ISO). sessionElapsedMs 의 기준점이다 */
  readonly sessionStartedAt: string | null
}

const IDLE: VisionAnalysisStatus = { state: 'IDLE', error: null }

/**
 * 화상 세션의 **내 카메라 영상**에 AI 파트의 VisionPipeline 을 물린다.
 *
 * 파이프라인이 만든 Vision v4 배치는 LiveKit DataChannel 의 `vision.v4` topic 으로
 * AI 워커에게만 Reliable 전송된다(`LiveKitVisionTransport`).
 *
 * 지켜야 하는 것
 *  - 원본 프레임은 브라우저 밖으로 나가지 않는다. 나가는 건 스칼라 지표뿐이다.
 *  - `visionEnabled=false` 면 분석·전송을 **둘 다** 멈춘다. 진행 중이었다면 버퍼도 버린다.
 *  - 분석이 실패해도 통화는 계속된다. 여기서 던지는 예외가 SessionPage 로 올라가면 안 된다.
 *
 * 알려진 한계: 카메라를 끄면 프레임 자체가 끊겨 `CAMERA_DISABLED` 행동 이벤트가 나가지
 * 않는다(파이프라인은 프레임이 있어야 상태를 전이한다). 수신 측은 metric 스냅샷의
 * `observationInterval` 공백으로 그 구간을 인식해야 한다.
 */
export function useVisionAnalysis(options: UseVisionAnalysisOptions): VisionAnalysisStatus {
  const {
    visionEnabled,
    room,
    localVideo,
    sessionId,
    userId,
    participantIdentity,
    sessionStartedAt,
  } = options

  const [status, setStatus] = useState<VisionAnalysisStatus>(IDLE)

  // 정리(cleanup) 시점에 "동의가 철회된 것인지, 세션이 끝난 것인지"를 구분해야 한다.
  // 전자는 버퍼를 버리고, 후자는 flush 한다 — effect 클로저는 옛 값을 보므로 ref 로 읽는다.
  const visionEnabledRef = useRef(visionEnabled)
  visionEnabledRef.current = visionEnabled

  // 분석용 video 엘리먼트. 화면의 PIP 를 쓰지 않는 이유는 그쪽이 카메라를 끄면 언마운트되어
  // 샘플러가 죽은 엘리먼트를 잡게 되기 때문이다. 여기서는 세션 내내 살아 있는 전용 엘리먼트를
  // 두고 트랙만 갈아 끼운다.
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mediaSourceRef = useRef<BrowserMediaSource | null>(null)

  const anchorMs = useSessionElapsedAnchor(sessionStartedAt)

  const ready =
    visionEnabled &&
    room !== null &&
    userId !== null &&
    participantIdentity !== null &&
    anchorMs !== null

  /* ── 분석 전용 video 엘리먼트 ──
     DOM 에 붙어 있어야 브라우저가 프레임을 넘겨준다(display:none 이면 rVFC 가 멈춘다).
     그래서 화면 밖이 아니라 "보이지만 안 보이는" 2px 짜리로 둔다. */
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

  /* ── 현재 카메라 트랙을 분석 엘리먼트에 붙인다 ──
     카메라 토글로 트랙이 바뀌어도 파이프라인·baseline 은 살아 있어야 하므로,
     아래 파이프라인 effect 와 의존성을 분리한다. */
  useEffect(() => {
    const element = videoRef.current
    if (!ready || element === null || localVideo === null) return

    localVideo.attach(element)
    const mediaStreamTrack = localVideo.mediaStreamTrack
    const mediaSource = new BrowserMediaSource(new MediaStream([mediaStreamTrack]))
    mediaSourceRef.current = mediaSource

    return () => {
      mediaSourceRef.current = null
      // dispose 는 관찰만 끊는다 — 카메라 트랙은 통화가 소유하므로 절대 stop 하지 않는다.
      mediaSource.dispose()
      localVideo.detach(element)
    }
  }, [ready, localVideo])

  /* ── 파이프라인 · 전송 ── */
  useEffect(() => {
    if (!ready || room === null || userId === null || participantIdentity === null) {
      setStatus(IDLE)
      return
    }
    const element = videoRef.current
    if (element === null) return

    if (participantIdentity !== participantIdentityOf(userId)) {
      // 서버 규칙(`user-{userId}`)이 깨졌다는 뜻이다. 수신 측이 발신자와 userId 를 대조하므로
      // 그대로 보내면 어차피 거절된다 — 여기서 멈추는 편이 원인을 찾기 쉽다.
      setStatus({
        state: 'UNAVAILABLE',
        error: `participantIdentity(${participantIdentity})가 userId(${userId})와 맞지 않습니다.`,
      })
      return
    }

    let disposed = false
    setStatus({ state: 'STARTING', error: null })

    const clock = new SystemClock()
    const timeline = new SessionTimeline(
      { sessionElapsedMsAtSync: anchorMs, clientMonotonicMsAtSync: clock.monotonicNowMs() },
      clock,
    )
    const eventFactory = new VisionEventFactory(
      {
        sessionId: String(sessionId),
        userId,
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
    const publisher = new BufferedVisionEventPublisher(
      new LiveKitVisionTransport({
        room,
        sessionId: String(sessionId),
        userId,
        participantIdentity,
        aiParticipantIdentity: aiWorkerIdentityOf(String(sessionId)),
      }),
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
      // 전송 실패는 publisher 가 버퍼에 담아 재시도한다 — 여기서 통화를 흔들면 안 된다.
      void runtime.process(frame, runtimeStatusOf()).catch(() => undefined)
    }

    // Worker 가 치명적으로 죽으면 샘플링부터 멈춰야 한다. 클라이언트가 샘플러보다 먼저
    // 만들어져야 해서(리스너를 붙인 채 생성된다) 참조는 나중에 채운다.
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
        // 모델(.task)·WASM 이 없으면 여기로 온다. 분석만 포기하고 통화는 그대로 둔다.
        setStatus({
          state: 'UNAVAILABLE',
          error: error instanceof Error ? error.message : 'Vision Worker 초기화 실패',
        })
      })

    return () => {
      disposed = true
      activeSampler.stop()
      // 동의 철회면 버퍼를 버리고(flush 안 함), 세션 종료면 마지막 배치까지 내보낸다.
      const reason = visionEnabledRef.current ? 'SESSION_ENDED' : 'CONSENT_WITHDRAWN'
      void activeRuntime
        .end(reason, {
          sessionElapsedMs: timeline.now().sessionElapsedMs,
          clientMonotonicMs: clock.monotonicNowMs(),
        })
        .catch(() => undefined)
        .finally(() => worker.terminate())
      setStatus(IDLE)
    }
  }, [ready, room, userId, participantIdentity, sessionId, anchorMs])

  return status
}

/**
 * `sessionElapsedMs` 의 기준점.
 *
 * 서버가 준 실제 시작 시각으로부터 지금까지 흐른 시간을 한 번만 계산해 고정한다.
 * (세션 도중 새로고침하면 0 이 아니라 "이미 흐른 만큼"에서 이어져야 한다.)
 * 시작 시각을 모르면 분석을 시작하지 않는다 — 0 으로 시작하면 두 참가자의 타임라인이
 * 어긋나 Aggregator 가 같은 순간을 다른 시각으로 본다.
 */
function useSessionElapsedAnchor(sessionStartedAt: string | null): number | null {
  const anchorRef = useRef<number | null>(null)
  const [anchor, setAnchor] = useState<number | null>(null)

  useEffect(() => {
    if (anchorRef.current !== null || sessionStartedAt === null) return
    const startedAtMs = new Date(sessionStartedAt).getTime()
    if (!Number.isFinite(startedAtMs)) return
    const elapsed = Math.max(0, Date.now() - startedAtMs)
    anchorRef.current = elapsed
    setAnchor(elapsed)
  }, [sessionStartedAt])

  return anchor
}
