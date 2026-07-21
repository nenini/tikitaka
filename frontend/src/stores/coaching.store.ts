import { create } from 'zustand'

export type CoachTone = 'positive' | 'negative' | 'neutral'

/** 본인 화면에만 표시되는 실시간 코칭 메시지 (COACH-01/02/04, 상대에게 미표시) */
export interface CoachMessage {
  id: string
  tone: CoachTone
  text: string
  at: number
}

/** 사용자 선택 개입 강도 (COACH-04) */
export type CoachIntensity = 'flow' | 'balanced' | 'active'

interface CoachingState {
  intensity: CoachIntensity
  messages: CoachMessage[]
  pushMessage: (msg: Omit<CoachMessage, 'id' | 'at'>) => void
  clear: () => void
  setIntensity: (intensity: CoachIntensity) => void
}

/**
 * 실시간 코칭 오버레이 상태. (FE-A 영역)
 * MediaPipe/STT 원시 지표가 아니라, "화면에 띄울 코칭 카드" 만 담는다.
 */
export const useCoachingStore = create<CoachingState>((set) => ({
  intensity: 'balanced',
  messages: [],
  pushMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, { ...msg, id: crypto.randomUUID(), at: Date.now() }].slice(-20),
    })),
  clear: () => set({ messages: [] }),
  setIntensity: (intensity) => set({ intensity }),
}))
