import { useEffect, useState } from 'react'

/**
 * 침묵 단계별 개입 (§11.1) — 이 시스템의 서명 인터랙션.
 * 각 단계는 앞 단계보다 딱 한 칸만 세진다. "적당한 침묵은 대화의 일부"라는 원칙이
 * UI 강도로 번역된 것이므로 임계값을 임의로 낮추지 않는다.
 */
export type SilenceStage =
  /** 0–10초 · 개입 없음. 아무것도 그리지 않는 것이 이 단계의 구현이다 */
  | 'none'
  /** 15–20초 · 화면 가장자리 작은 주제 버튼 */
  | 'topic'
  /** 30초+ · 선택형 질문 카드 */
  | 'question'
  /** 45초+ · AI 코치 맥락 질문. 최대 강도이며 그 이상은 없다 */
  | 'coach'

export interface SilenceThresholds {
  topic: number
  question: number
  coach: number
}

export const DEFAULT_SILENCE_THRESHOLDS: SilenceThresholds = {
  topic: 15,
  question: 30,
  coach: 45,
}

/** 침묵 지속 시간(초) → 개입 단계. 순수 함수라 테스트·스토리북에서 그대로 쓴다. */
export function silenceStageOf(
  silenceSec: number,
  thresholds: SilenceThresholds = DEFAULT_SILENCE_THRESHOLDS,
): SilenceStage {
  if (silenceSec >= thresholds.coach) return 'coach'
  if (silenceSec >= thresholds.question) return 'question'
  if (silenceSec >= thresholds.topic) return 'topic'
  return 'none'
}

export interface UseSilenceStageOptions {
  /** 마지막으로 발화가 감지된 시각(epoch ms). null 이면 계측 전 */
  lastVoiceAt: number | null
  /** 코칭 미동의자·연결 전에는 계측을 멈춘다 */
  enabled?: boolean
  thresholds?: SilenceThresholds
}

/**
 * 침묵 시간을 1초 단위로 세어 개입 단계를 돌려준다.
 *
 * ⚠️ 발화 감지(VAD) 자체는 이 훅의 책임이 아니다 — 오디오 분석이나 서버의
 * `silence.detected` 이벤트가 `lastVoiceAt` 을 갱신해주면 여기서는 경과 시간만 센다.
 * 초당 갱신되는 값이므로 이 훅을 쓰는 컴포넌트는 가볍게 유지한다.
 */
export function useSilenceStage({
  lastVoiceAt,
  enabled = true,
  thresholds = DEFAULT_SILENCE_THRESHOLDS,
}: UseSilenceStageOptions): { stage: SilenceStage; silenceSec: number } {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled || lastVoiceAt == null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [enabled, lastVoiceAt])

  if (!enabled || lastVoiceAt == null) return { stage: 'none', silenceSec: 0 }

  const silenceSec = Math.max(0, Math.floor((now - lastVoiceAt) / 1000))
  return { stage: silenceStageOf(silenceSec, thresholds), silenceSec }
}
