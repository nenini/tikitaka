import { create } from 'zustand'

export type SessionPhase =
  | 'idle'
  | 'waiting-room' // 상황형 대기방 (ROOM-01~03)
  | 'connecting' // WebRTC 연결 중 (SESSION-01)
  | 'in-session' // 30분 화상 세션 진행
  | 'extended' // 5분 연장 (SESSION-04 / CONTACT-01)
  | 'ended'

interface SessionState {
  phase: SessionPhase
  sessionId: string | null
  /** 남은 시간(초) — 30분 타이머 (SESSION-02) */
  remainingSec: number
  localMicOn: boolean
  localCamOn: boolean
  setPhase: (phase: SessionPhase) => void
  setSessionId: (id: string | null) => void
  setRemaining: (sec: number) => void
  toggleMic: () => void
  toggleCam: () => void
  reset: () => void
}

/**
 * 실시간 화상 세션 상태. (FE-A 영역)
 * ⚠️ WebRTC 스트림/MediaPipe 지표처럼 초당 다수 갱신되는 데이터는 여기에 넣지 말고
 *    ref/이벤트로 다루세요. 이 스토어는 "화면 phase·토글" 같은 저빈도 상태 전용.
 */
export const useSessionStore = create<SessionState>((set) => ({
  phase: 'idle',
  sessionId: null,
  remainingSec: 30 * 60,
  localMicOn: true,
  localCamOn: true,
  setPhase: (phase) => set({ phase }),
  setSessionId: (sessionId) => set({ sessionId }),
  setRemaining: (remainingSec) => set({ remainingSec }),
  toggleMic: () => set((s) => ({ localMicOn: !s.localMicOn })),
  toggleCam: () => set((s) => ({ localCamOn: !s.localCamOn })),
  reset: () =>
    set({ phase: 'idle', sessionId: null, remainingSec: 30 * 60, localMicOn: true, localCamOn: true }),
}))
