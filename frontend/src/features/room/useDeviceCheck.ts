import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceStatus } from './types'

/**
 * 대기방 기기 점검(W-11) — **클라 전용**. getUserMedia 로 카메라·마이크를 잡고,
 * Web Audio 로 마이크 입력 레벨과 스피커 테스트음을 만든다. 서버 저장은 없다.
 *
 * ⚠️ 마이크 레벨은 초당 수십 번 갱신되는 값이라 React state 에 넣지 않는다.
 *    ref 로 <meter> DOM 을 직접 갱신하도록 `meterRef` 를 노출하고, rAF 루프에서만 만진다.
 *    (README §5 · 리렌더 폭탄 방지)
 */
export interface UseDeviceCheck {
  /** 카메라 미리보기용 <video> 에 연결할 ref */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** 마이크 레벨 바(<i>)에 연결할 ref — width 를 직접 갱신한다 */
  meterRef: React.RefObject<HTMLElement | null>
  camera: DeviceStatus
  microphone: DeviceStatus
  speakerPlaying: boolean
  errorReason: string | null
  /** 카메라+마이크 모두 정상 → 입장 가능 */
  ready: boolean
  /** 권한 거부/장치 오류 후 다시 점검 */
  retry: () => void
  /** 스피커 테스트음(짧은 비프) 재생 */
  playTestTone: () => void
}

/** getUserMedia 예외 → 사용자용 한국어 사유. */
function describeError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '카메라·마이크 사용이 차단돼 있어요. 브라우저 주소창의 권한을 허용으로 바꿔주세요.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '연결된 카메라 또는 마이크를 찾지 못했어요. 기기 연결을 확인해 주세요.'
    case 'NotReadableError':
      return '다른 앱이 카메라·마이크를 쓰고 있어요. 해당 앱을 끄고 다시 시도해 주세요.'
    default:
      return '기기를 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
  }
}

export function useDeviceCheck(): UseDeviceCheck {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const meterRef = useRef<HTMLElement | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)

  const [camera, setCamera] = useState<DeviceStatus>('idle')
  const [microphone, setMicrophone] = useState<DeviceStatus>('idle')
  const [speakerPlaying, setSpeakerPlaying] = useState(false)
  const [errorReason, setErrorReason] = useState<string | null>(null)
  /** retry 시 effect 를 다시 돌리기 위한 nonce */
  const [attempt, setAttempt] = useState(0)

  /** 마이크 레벨 rAF 루프 — RMS 를 0~100% width 로 변환해 meterRef 를 직접 갱신. */
  const startMeter = useCallback((stream: MediaStream) => {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    audioCtxRef.current = ctx
    // 자동재생 정책으로 컨텍스트가 suspended 로 시작할 수 있다 → 레벨 미터가 0 으로 멈춘다.
    // getUserMedia 허용/버튼 클릭은 사용자 제스처라 resume 이 통과한다.
    void ctx.resume().catch(() => {})
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    analyserRef.current = analyser

    const buf = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      // 말소리 정도면 꽉 차 보이도록 완만하게 부스트(×260, 상한 100)
      const pct = Math.min(100, Math.round(rms * 260))
      if (meterRef.current) meterRef.current.style.width = `${pct}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  /** 모든 자원 정리(트랙 stop · rAF 취소 · AudioContext close). */
  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    analyserRef.current = null
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setCamera('checking')
    setMicrophone('checking')
    setErrorReason(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('error')
      setMicrophone('error')
      setErrorReason('이 브라우저는 카메라·마이크 접근을 지원하지 않아요. 최신 크롬/사파리에서 열어주세요.')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {})
        }
        setCamera(stream.getVideoTracks().length > 0 ? 'ready' : 'error')
        setMicrophone(stream.getAudioTracks().length > 0 ? 'ready' : 'error')
        if (stream.getAudioTracks().length > 0) startMeter(stream)
      })
      .catch((err) => {
        if (cancelled) return
        setCamera('error')
        setMicrophone('error')
        setErrorReason(describeError(err))
      })

    return () => {
      cancelled = true
      teardown()
    }
  }, [attempt, startMeter, teardown])

  const retry = useCallback(() => {
    teardown()
    if (meterRef.current) meterRef.current.style.width = '0%'
    setAttempt((n) => n + 1)
  }, [teardown])

  /** 스피커 테스트: 짧은 사인파 비프(약 700ms) — 오디오 파일 없이 즉시 재생. */
  const playTestTone = useCallback(() => {
    if (speakerPlaying) return
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 523.25 // C5 — 부드러운 알림음
      // 클릭음 방지: 짧은 페이드 인/아웃
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04)
      gain.gain.linearRampToValueAtTime(0, now + 0.7)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.72)
      setSpeakerPlaying(true)
      osc.onended = () => {
        setSpeakerPlaying(false)
        void ctx.close().catch(() => {})
      }
    } catch {
      setSpeakerPlaying(false)
    }
  }, [speakerPlaying])

  return {
    videoRef,
    meterRef,
    camera,
    microphone,
    speakerPlaying,
    errorReason,
    ready: camera === 'ready' && microphone === 'ready',
    retry,
    playTestTone,
  }
}
