import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionState as BtConnectionState } from '@/components'
import { useStomp, useStompSubscription } from '@/shared/realtime/useStomp'
import { useCoachingStore } from '@/stores/coaching.store'
import {
  sessionCommands,
  sessionTopics,
  toCoachTone,
  toSilenceStage,
} from './types'
import type {
  ContextualQuestionEvent,
  CoachingMessageEvent,
  SafetyWarningEvent,
  SessionClientConnectionState,
  SessionEndedPayload,
  SessionNetworkQuality,
  SessionParticipantEvent,
  SessionTimerEvent,
  SilenceInterventionEvent,
} from './types'

/**
 * 세션 실시간 계층 (STOMP).
 *
 * 서버가 밀어주는 것 (구독)
 *  - `/topic/sessions/{id}/timer`        남은 시간 · 종료 임박 (1초 주기, 연장 반영)
 *  - `/topic/sessions/{id}/participants` 상대 연결/미디어/네트워크 변화
 *  - `/topic/sessions/{id}/lifecycle`    세션 종료
 *  - `/topic/sessions/{id}/silence`      침묵 개입 단계 + 질문 카드
 *  - `/user/queue/sessions/{id}/coaching`  실시간 코칭 (**본인 전용**)
 *  - `/user/queue/sessions/{id}/questions` 맥락 질문 추천 (**본인 전용**)
 *  - `/user/queue/sessions/{id}/safety`    안전 경고 (**본인 전용**)
 *
 * 클라이언트가 보고하는 것 (전송)
 *  - `/app/sessions/{id}/heartbeat`        5초 주기 (서버 타임아웃 15s)
 *  - `/app/sessions/{id}/connection-state` 재연결 시작/완료
 *  - `/app/sessions/{id}/media-state`      카메라·마이크 토글
 *  - `/app/sessions/{id}/network-quality`  연결 품질 변화
 *
 * ⚠️ 모든 전송 페이로드에 `clientInstanceId` 와 `participantSid` 가 **필수**다.
 *    `participantSid` 는 LiveKit 연결 후에야 생기므로, 그전에는 아무것도 보내지 않는다.
 */

/** 하트비트 주기. 서버 `session.realtime.heartbeat-timeout` 이 15s 라 넉넉히 5s. */
const HEARTBEAT_INTERVAL_MS = 5_000

/** 이 브라우저 탭을 식별하는 값. 서버가 "지금 붙어 있는 연결"을 구분하는 데 쓴다. */
const CLIENT_INSTANCE_ID = `web-${Math.random().toString(36).slice(2, 10)}-${performance.now().toFixed(0)}`

export interface SessionRealtimeInput {
  /** null 이면 실시간 계층을 붙이지 않는다 */
  sessionId: number | null
  /** LiveKit participant SID. 없으면 전송을 보류한다 */
  participantSid: string | null
  /** LiveKit 연결 상태 — 재연결 보고와 품질 보고의 근거 */
  connectionState: BtConnectionState
  cameraEnabled: boolean
  microphoneEnabled: boolean
}

export interface SessionRealtime {
  /** 서버 기준 남은 초. 아직 못 받았으면 null */
  remainingSeconds: number | null
  /** 마지막 타이머 이벤트(종료 임박 판정에 쓴다) */
  timerEvent: SessionTimerEvent | null
  /** 세션 종료 이벤트. 값이 들어오면 화면을 종료 흐름으로 넘긴다 */
  ended: SessionEndedPayload | null
  /** 현재 유효한 침묵 개입. 사용자가 닫으면 null 로 지운다 */
  silence: SilenceInterventionEvent | null
  dismissSilence: () => void
  /** 맥락 질문(45초+ 단계). 침묵이 해제되면 비운다 */
  contextualQuestions: string[]
  /** 최근 안전 경고. 사용자가 확인하면 null 로 지운다 */
  safety: SafetyWarningEvent | null
  dismissSafety: () => void
  /** 상대 참가자의 실시간 상태(userId → 상태) */
  participants: Record<number, SessionParticipantEvent>
  /** STOMP 연결이 살아 있는가 */
  realtimeConnected: boolean
}

/** 디자인 시스템 연결 상태 → 서버 `SessionNetworkQuality`. */
function toNetworkQuality(state: BtConnectionState): SessionNetworkQuality {
  switch (state) {
    case 'connected':
      return 'GOOD'
    case 'unstable':
      return 'POOR'
    case 'reconnecting':
      return 'POOR'
    case 'disconnected':
      return 'LOST'
    default:
      return 'UNKNOWN'
  }
}

export function useSessionRealtime({
  sessionId,
  participantSid,
  connectionState,
  cameraEnabled,
  microphoneEnabled,
}: SessionRealtimeInput): SessionRealtime {
  const { connection, state: stompState } = useStomp(sessionId != null)
  const topics = useMemo(() => (sessionId != null ? sessionTopics(sessionId) : null), [sessionId])
  const commands = useMemo(() => (sessionId != null ? sessionCommands(sessionId) : null), [sessionId])

  const [timerEvent, setTimerEvent] = useState<SessionTimerEvent | null>(null)
  const [ended, setEnded] = useState<SessionEndedPayload | null>(null)
  const [silence, setSilence] = useState<SilenceInterventionEvent | null>(null)
  const [contextualQuestions, setContextualQuestions] = useState<string[]>([])
  const [safety, setSafety] = useState<SafetyWarningEvent | null>(null)
  const [participants, setParticipants] = useState<Record<number, SessionParticipantEvent>>({})

  const pushCoachMessage = useCoachingStore((s) => s.pushMessage)

  /* ── 구독 ── */

  useStompSubscription(connection, topics?.timer ?? null, (body) => {
    setTimerEvent(body as SessionTimerEvent)
  })

  useStompSubscription(connection, topics?.lifecycle ?? null, (body) => {
    setEnded(body as SessionEndedPayload)
  })

  useStompSubscription(connection, topics?.participants ?? null, (body) => {
    const event = body as SessionParticipantEvent
    if (event?.userId == null) return
    // 연결 변화 이벤트와 미디어 변화 이벤트가 같은 토픽으로 온다 — 나중 값으로 덮어쓴다.
    setParticipants((prev) => ({ ...prev, [event.userId]: { ...prev[event.userId], ...event } }))
  })

  useStompSubscription(connection, topics?.silence ?? null, (body) => {
    const event = body as SilenceInterventionEvent
    // NONE 은 "침묵 해제" 신호다 — 힌트와 맥락 질문을 함께 치운다.
    if (event.interventionStage === 'NONE') {
      setSilence(null)
      setContextualQuestions([])
      return
    }
    setSilence(event)
  })

  useStompSubscription(connection, topics?.questions ?? null, (body) => {
    const event = body as ContextualQuestionEvent
    setContextualQuestions(event.questions ?? [])
  })

  useStompSubscription(connection, topics?.coaching ?? null, (body) => {
    const event = body as CoachingMessageEvent
    if (!event?.messageText) return
    // 코칭 스토어는 "화면에 띄울 카드"만 담는다 — 원시 이벤트를 그대로 넣지 않는다.
    // 우선순위와 만료(TTL)는 겹침·자동 사라짐 처리에 쓰이므로 반드시 함께 넘긴다.
    pushCoachMessage({
      tone: toCoachTone(event.coachingType),
      text: event.messageText,
      priority: event.priority,
      triggeredAtSessionElapsedMs: event.triggeredAtSessionElapsedMs,
      expiresAtSessionElapsedMs: event.expiresAtSessionElapsedMs,
    })
  })

  useStompSubscription(connection, topics?.safety ?? null, (body) => {
    setSafety(body as SafetyWarningEvent)
  })

  /* ── 전송: 하트비트 ── */

  const canReport = Boolean(connection && commands && participantSid && stompState === 'connected')

  useEffect(() => {
    if (!canReport || !commands || !participantSid || !connection) return
    const payload = { clientInstanceId: CLIENT_INSTANCE_ID, participantSid }
    // 붙는 즉시 한 번 보내고, 이후 주기적으로 보낸다(서버 타임아웃 15s).
    connection.send(commands.heartbeat, payload)
    const timer = window.setInterval(() => connection.send(commands.heartbeat, payload), HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [canReport, commands, participantSid, connection])

  /* ── 전송: 미디어 상태 ── */

  useEffect(() => {
    if (!canReport || !commands || !participantSid || !connection) return
    connection.send(commands.mediaState, {
      clientInstanceId: CLIENT_INSTANCE_ID,
      participantSid,
      cameraEnabled,
      microphoneEnabled,
    })
  }, [canReport, commands, participantSid, connection, cameraEnabled, microphoneEnabled])

  /* ── 전송: 네트워크 품질 ── */

  const networkQuality = toNetworkQuality(connectionState)
  useEffect(() => {
    if (!canReport || !commands || !participantSid || !connection) return
    connection.send(commands.networkQuality, {
      clientInstanceId: CLIENT_INSTANCE_ID,
      participantSid,
      networkQuality,
    })
  }, [canReport, commands, participantSid, connection, networkQuality])

  /* ── 전송: 재연결 상태 ── */

  // 직전 상태를 기억해 'reconnecting → connected' 전이에서만 RECONNECTED 를 보낸다.
  const prevConnectionState = useRef<BtConnectionState>(connectionState)
  useEffect(() => {
    if (!canReport || !commands || !participantSid || !connection) {
      prevConnectionState.current = connectionState
      return
    }
    const previous = prevConnectionState.current
    prevConnectionState.current = connectionState

    let report: SessionClientConnectionState | null = null
    if (connectionState === 'reconnecting' && previous !== 'reconnecting') report = 'RECONNECTING'
    if (connectionState === 'connected' && previous === 'reconnecting') report = 'RECONNECTED'
    if (!report) return

    connection.send(commands.connectionState, {
      clientInstanceId: CLIENT_INSTANCE_ID,
      participantSid,
      state: report,
    })
  }, [canReport, commands, participantSid, connection, connectionState])

  const dismissSilence = useCallback(() => {
    setSilence(null)
    setContextualQuestions([])
  }, [])

  const dismissSafety = useCallback(() => setSafety(null), [])

  return {
    remainingSeconds: timerEvent?.remainingSeconds ?? null,
    timerEvent,
    ended,
    silence,
    dismissSilence,
    contextualQuestions,
    safety,
    dismissSafety,
    participants,
    realtimeConnected: stompState === 'connected',
  }
}

/** 침묵 이벤트 → 화면의 SilenceStage. 이벤트가 없으면 'none'. */
export function silenceStageOfEvent(event: SilenceInterventionEvent | null) {
  return event ? toSilenceStage(event.interventionStage) : 'none'
}
