import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = 'IDLE' | 'REQUESTING' | 'READY' | 'DENIED' | 'UNAVAILABLE'

export interface LocalCamera {
  readonly state: CameraState
  readonly stream: MediaStream | null
  /** 로컬 진단용. 사용자에게는 상태별 문구를 따로 쓴다 */
  readonly error: string | null
  readonly start: () => void
  readonly stop: () => void
}

/**
 * 혼자 연습용 카메라.
 *
 * LiveKit 을 쓰지 않는다 — 전송할 상대가 없으므로 `getUserMedia` 하나면 충분하고,
 * 룸을 붙이면 서버 세션·토큰이 필요해진다(그게 없어서 혼자 연습인 것이다).
 *
 * ⚠️ **오디오는 요청하지 않는다.** 소리를 쓰지 않는데 마이크 권한을 받으면
 *    사용자는 녹음된다고 의심한다. 발화 여부는 이 모드에서 측정하지 않는다.
 */
export function useLocalCamera(): LocalCamera {
  const [state, setState] = useState<CameraState>('IDLE')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 언마운트 뒤 도착한 스트림을 그대로 두면 카메라 불이 켜진 채로 남는다.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const stop = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop())
      return null
    })
    setState('IDLE')
  }, [])

  const start = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('UNAVAILABLE')
      setError('이 브라우저는 카메라를 지원하지 않습니다.')
      return
    }
    setState('REQUESTING')
    setError(null)
    void navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((next) => {
        if (!aliveRef.current) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        setStream(next)
        setState('READY')
      })
      .catch((cause: unknown) => {
        if (!aliveRef.current) return
        const name = cause instanceof DOMException ? cause.name : ''
        // NotAllowedError = 사용자가 거부. 나머지는 기기 문제라 안내가 달라야 한다.
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'DENIED' : 'UNAVAILABLE')
        setError(cause instanceof Error ? cause.message : '카메라를 열지 못했습니다.')
      })
  }, [])

  // 화면을 떠나면 반드시 끈다 — 카메라 불이 남으면 사용자는 계속 찍히는 줄 안다.
  useEffect(() => {
    return () => {
      setStream((current) => {
        current?.getTracks().forEach((track) => track.stop())
        return null
      })
    }
  }, [])

  return { state, stream, error, start, stop }
}
