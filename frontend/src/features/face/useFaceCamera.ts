import { useCallback, useEffect, useRef, useState } from 'react'
import { CAPTURE_JPEG_QUALITY, CAPTURE_MAX_WIDTH } from './types'

export type FaceCameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'error'

export interface UseFaceCamera {
  /**
   * `<video>` 에 붙이는 **콜백 ref**.
   *
   * 일반 ref 를 쓰면 안 된다. 미리보기 `<video>` 는 촬영 단계에 들어가야 렌더되는데
   * `getUserMedia` 는 그보다 먼저 끝난다 — 스트림을 붙이려는 시점에 엘리먼트가 아직
   * 없어서 srcObject 가 영영 설정되지 않고, 권한만 잡힌 채 화면이 검게 남는다.
   * 콜백 ref 로 두면 엘리먼트가 마운트되는 순간 붙이므로 순서에 영향받지 않는다.
   */
  attachVideo: (element: HTMLVideoElement | null) => void
  status: FaceCameraStatus
  /** 사용자에게 보여줄 실패 사유. `status` 가 denied·error 일 때만 채워진다. */
  errorMessage: string | null
  start: () => Promise<void>
  stop: () => void
  /** 현재 프레임을 JPEG Blob 으로 굽는다. 준비 전이면 null. */
  capture: () => Promise<Blob | null>
}

/** getUserMedia 예외 → 사용자용 한국어 사유. (대기방 useDeviceCheck 과 같은 어휘) */
function describeError(error: unknown): { status: FaceCameraStatus; message: string } {
  const name = error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        status: 'denied',
        message: '카메라 사용이 차단돼 있어요. 브라우저 주소창의 권한을 허용으로 바꿔주세요.',
      }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        status: 'error',
        message: '연결된 카메라를 찾지 못했어요. 기기 연결을 확인해 주세요.',
      }
    case 'NotReadableError':
      return {
        status: 'error',
        message: '다른 앱이 카메라를 쓰고 있어요. 해당 앱을 끄고 다시 시도해 주세요.',
      }
    default:
      return { status: 'error', message: '카메라를 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
}

/**
 * 얼굴 촬영용 카메라.
 *
 * 대기방의 `useDeviceCheck` 과 달리 **마이크를 잡지 않는다** — 사진 한 장에 마이크 권한까지
 * 요구하면 거절률이 올라간다.
 *
 * 정리(track.stop)를 언마운트·이탈 시 반드시 수행한다. 안 하면 카메라 표시등이 계속 켜져 있고,
 * 기능명세 §22 의 자원 해제 원칙에도 어긋난다.
 */
export function useFaceCamera(): UseFaceCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<FaceCameraStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /** 엘리먼트와 스트림이 **둘 다 준비된 순간** 연결한다. 어느 쪽이 먼저 와도 된다. */
  const bind = useCallback(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || video.srcObject === stream) return
    video.srcObject = stream
    void video.play().catch(() => {
      /* 자동재생 차단은 muted+playsInline 로 이미 막았고, 실패해도 프레임은 읽힌다 */
    })
  }, [])

  const attachVideo = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element
      bind()
    },
    [bind],
  )

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      // https 가 아니면 mediaDevices 자체가 없다 — 원인을 정확히 짚어준다
      setErrorMessage(
        window.isSecureContext
          ? '이 브라우저는 카메라를 지원하지 않아요.'
          : '보안 연결(https)에서만 카메라를 쓸 수 있어요. https 주소로 접속해 주세요.',
      )
      return
    }

    setStatus('requesting')
    setErrorMessage(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 전면 카메라 우선. ideal 이라 후면만 있는 기기에서도 실패하지 않는다.
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      // 이 시점엔 아직 <video> 가 없을 수 있다. 없으면 attachVideo 가 마운트 때 붙인다.
      bind()
      setStatus('ready')
    } catch (error) {
      const described = describeError(error)
      setStatus(described.status)
      setErrorMessage(described.message)
    }
  }, [bind])

  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return null

    // 긴 변을 상한에 맞춰 축소한다(AI 서비스 권장 ≤1600px, 5MiB 제한).
    const scale = Math.min(1, CAPTURE_MAX_WIDTH / video.videoWidth)
    const width = Math.round(video.videoWidth * scale)
    const height = Math.round(video.videoHeight * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // 미리보기만 CSS 로 좌우 반전한다. 여기서는 반전 없이 원본 그대로 그린다.
    ctx.drawImage(video, 0, 0, width, height)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', CAPTURE_JPEG_QUALITY)
    })
  }, [])

  // 언마운트 시 트랙 해제 — 카메라 표시등이 남지 않게 한다
  useEffect(() => stop, [stop])

  return { attachVideo, status, errorMessage, start, stop, capture }
}
