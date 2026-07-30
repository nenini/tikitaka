import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertDialog, Button, CallControls, Callout, DarkScope, Icon, IconButton } from '@/components'
import type { QuestionOption } from '@/components'
import { useCoachingStore } from '@/stores/coaching.store'
import { useSessionStore } from '@/stores/session.store'
import { errorMessageOf } from '@/shared/api/envelope'
import { themeForHour } from '@/features/room/api'
import { AudioTrackView } from './livekit/TrackView'
import { createApiTokenProvider } from './livekit/tokenProvider'
import { useLiveKitRoom } from './livekit/useLiveKitRoom'
import { CoachRail } from './components/CoachRail'
import { SessionStage } from './components/SessionStage'
import { SilenceHint } from './components/SilenceHint'
import type { SilenceTopic } from './components/SilenceHint'
import type { ExtensionChoice } from './components/ExtensionOfferCard'
import {
  getSessionDetail,
  getSessionMissions,
  getSessionStatus,
  startSession,
  terminateSession,
} from './api'
import { silenceStageOfEvent, useSessionRealtime } from './useSessionRealtime'
import type { SessionDetail, SessionMission, SessionStatusSnapshot } from './types'

/** 세션 시작 조건 확인 폴링 주기. 진행 중이 되면 멈춘다. */
const STATUS_POLL_MS = 3_000

/**
 * W-12 화상 세션 (SESSION-01/02 · COACH · SILENCE · SAFETY · MISSION).
 *
 * 레이아웃: 데스크탑은 [상대 영상 | 코치 레일 322px] 2단, 모바일은 [영상 / 코치 스트립] 세로 적층.
 * 디자인 시스템 §7.3 — 상대 얼굴이 주인공이므로 OS 설정과 무관하게 **항상 다크**(DarkScope).
 *
 * 백엔드 연동
 *  - LiveKit 토큰: `POST /api/v1/sessions/{id}/join` 응답 (전용 토큰 엔드포인트는 없다)
 *  - 남은 시간: **서버가 SSOT** — STOMP `/topic/sessions/{id}/timer` + `GET /sessions/{id}/status`
 *  - 세션 시작: `POST /sessions/{id}/start` (2명 입장·준비·LiveKit 연결이 모두 끝나야 통과)
 *  - 코칭/침묵/안전/맥락 질문: STOMP (`useSessionRealtime`)
 *  - 미션: `GET /sessions/{id}/missions`
 *  - 종료: `POST /sessions/{id}/terminate` · 서버 종료는 `/topic/sessions/{id}/lifecycle` 로 통보
 *
 * ⚠️ 5분 연장(W-15)은 백엔드에 CONTACT 도메인이 없어 **아직 로컬 토글**이다.
 *    수락해도 서버 타이머는 늘어나지 않는다.
 */
export function SessionPage() {
  const { sessionId: sessionIdParam } = useParams()
  const navigate = useNavigate()

  const sessionId = Number(sessionIdParam)
  const validSession = Number.isFinite(sessionId) && sessionId > 0

  const setPhase = useSessionStore((s) => s.setPhase)
  const clearCoaching = useCoachingStore((s) => s.clear)

  /* ── LiveKit ── */
  // getToken 이 매 렌더 새 함수면 훅의 effect 가 재실행되어 재연결된다 — 반드시 고정한다.
  const getToken = useMemo(
    () => (validSession ? createApiTokenProvider(sessionId) : notConfiguredProvider),
    [validSession, sessionId],
  )
  // roomName 은 서버 토큰에 이미 들어 있어 쓰이지 않는다(인자 자리만 채운다).
  const session = useLiveKitRoom(String(sessionId), getToken)

  /* ── 실시간(STOMP) ── */
  const realtime = useSessionRealtime({
    sessionId: validSession ? sessionId : null,
    participantSid: session.localParticipantSid,
    connectionState: session.state,
    cameraEnabled: !session.cameraDisabled,
    microphoneEnabled: !session.muted,
  })

  /* ── 세션 메타 · 상태 ── */
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [status, setStatus] = useState<SessionStatusSnapshot | null>(null)
  const [missions, setMissions] = useState<SessionMission[]>([])
  const [actionError, setActionError] = useState<string | null>(null)

  const remainingSec = useServerTimer(validSession ? sessionId : null, realtime.remainingSeconds)

  useEffect(() => {
    if (!validSession) return
    setPhase('in-session')
    // 이전 세션의 코칭 카드가 남아 있으면 안 된다.
    clearCoaching()
    return () => clearCoaching()
  }, [validSession, setPhase, clearCoaching])

  useEffect(() => {
    if (!validSession) return
    let alive = true
    getSessionDetail(sessionId)
      .then((d) => alive && setDetail(d))
      .catch(() => {
        /* 메타 조회 실패는 치명적이지 않다 — 영상·타이머는 계속 돈다 */
      })
    return () => {
      alive = false
    }
  }, [validSession, sessionId])

  /* ── 세션 상태 폴링 ──
     ① 시작 조건이 갖춰지면 start 를 두드린다.
        서버 조건: status=READY · 2명 joined · 2명 ready · 2명 LiveKit CONNECTED.
        마지막 조건은 LiveKit webhook 으로 서버에 반영되므로 갖춰질 때까지 재시도한다.
        start 는 멱등이고 조건 미달이면 null 을 돌려주므로(409 흡수) 여러 번 불러도 안전하다.
     ② 서버가 세션을 끝냈는지도 여기서 감지한다.
        원래는 `/topic/sessions/{id}/lifecycle` 푸시로 알지만, **소켓이 끊긴 동안에도
        화면이 죽은 세션에 머무르지 않도록** REST 로 한 번 더 확인한다. */
  const [serverEnded, setServerEnded] = useState(false)
  useEffect(() => {
    if (!validSession || serverEnded) return
    let alive = true

    async function tick() {
      try {
        const snapshot = await getSessionStatus(sessionId)
        if (!alive) return
        setStatus(snapshot)

        if (snapshot.status === 'COMPLETED' || snapshot.status === 'CANCELLED') {
          setServerEnded(true)
          return
        }
        if (
          snapshot.status === 'READY' &&
          snapshot.allJoined &&
          snapshot.allReady &&
          snapshot.allConnected
        ) {
          const started = await startSession(sessionId)
          if (alive && started) setStatus(started)
        }
      } catch {
        /* 일시 오류는 다음 tick 에서 회복한다 */
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), STATUS_POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [validSession, sessionId, serverEnded])

  /* ── 미션 ── 세션이 시작되는 시점에 서버가 배정한다 */
  useEffect(() => {
    if (!validSession || status?.status !== 'IN_PROGRESS') return
    let alive = true
    void getSessionMissions(sessionId).then((result) => {
      if (alive && result) setMissions(result.missions)
    })
    return () => {
      alive = false
    }
  }, [validSession, sessionId, status?.status])

  /* ── 코칭 ── 한 번에 하나만 띄운다(원칙 2). 스토어의 마지막 메시지만 꺼내 쓴다. */
  const messages = useCoachingStore((s) => s.messages)
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const latest = messages.at(-1) ?? null
  const visibleMessage = latest && latest.id !== dismissedId ? latest : null

  /* ── 침묵 힌트 ── 서버가 단계와 질문을 함께 내려준다(임계값 15/30/45초) */
  const silenceStage = silenceStageOfEvent(realtime.silence)
  const silenceSec = realtime.silence ? Math.floor(realtime.silence.silenceDurationMs / 1000) : 0

  // TOPIC_HINT 단계에서는 질문 대신 **카테고리**만 보여준다(읽을 거리, 누를 거리 아님).
  const silenceTopics: SilenceTopic[] = useMemo(() => {
    const categories = new Set((realtime.silence?.questions ?? []).map((q) => q.category))
    return [...categories].filter(Boolean).map((category) => ({ id: category, label: category }))
  }, [realtime.silence])

  // 45초+ 단계는 맥락 질문(문자열)이 별도 큐로 온다. 그 전 단계는 질문 카드를 쓴다.
  const silenceQuestions: QuestionOption[] = useMemo(() => {
    if (realtime.contextualQuestions.length > 0) {
      return realtime.contextualQuestions.map((text, index) => ({ id: `ctx-${index}`, text }))
    }
    return (realtime.silence?.questions ?? []).map((q) => ({
      id: String(q.questionCardId),
      text: q.content,
    }))
  }, [realtime.contextualQuestions, realtime.silence])

  /* ── 5분 연장 ── ⚠️ 서버 API 없음(CONTACT 도메인 미구현) → 로컬 토글만 */
  const [extensionChoice, setExtensionChoice] = useState<ExtensionChoice>('pending')
  const extensionVisible =
    realtime.timerEvent?.eventType === 'SESSION_ENDING_IMMINENT' ||
    (remainingSec != null && remainingSec <= 60 && remainingSec > 0)

  /* ── 종료 ── */
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  const [ending, setEnding] = useState(false)

  const goToReview = useCallback(() => {
    setPhase('ended')
    navigate(`/session/${sessionId}/review`, { replace: true })
  }, [navigate, sessionId, setPhase])

  /**
   * 서버가 세션을 끝냈다(시간 만료·상대 종료·재연결 실패) → 평가 화면으로.
   * STOMP lifecycle 푸시(`realtime.ended`)가 먼저 오지만, 소켓이 끊겼을 때는
   * 상태 폴링이 잡아낸 `serverEnded` 가 같은 역할을 한다.
   */
  useEffect(() => {
    if (!realtime.ended && !serverEnded) return
    session.disconnect()
    goToReview()
  }, [realtime.ended, serverEnded, session, goToReview])

  async function leaveSession() {
    if (ending) return
    setEnding(true)
    try {
      // 조기 종료는 사유가 필수다(`SessionTerminateRequest.reason`).
      await terminateSession(sessionId, 'USER_REQUEST')
    } catch (error) {
      // 이미 끝난 세션이면 409 다 — 그래도 화면은 평가로 넘어가야 한다.
      setActionError(errorMessageOf(error, '세션을 종료하는 중 문제가 생겼어요.'))
    } finally {
      setEnding(false)
      session.disconnect()
      goToReview()
    }
  }

  const themeLabel = useMemo(() => {
    if (!detail?.scheduledStartAt) return undefined
    return themeForHour(new Date(detail.scheduledStartAt).getHours()).theme.name
  }, [detail?.scheduledStartAt])

  // 2인 세션이라 닉네임이 있는 참가자 중 첫 번째를 상대로 본다
  // (응답에 "나"를 표시하는 필드가 없다).
  const partnerName = detail?.participants.find((p) => p.nickname)?.nickname ?? undefined

  if (!validSession) {
    return (
      <DarkScope>
        <div className="mx-auto flex h-[100dvh] max-w-[440px] flex-col items-center justify-center gap-4 p-6 text-center">
          <Icon name="error-circle" size={40} className="text-faint" />
          <h1 className="bt-h3">세션을 찾을 수 없어요</h1>
          <p className="bt-body-sm bt-muted">
            세션은 매칭이 확정되고 대기방에서 양쪽이 준비를 마친 뒤에 시작돼요.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/')}>
              홈으로
            </Button>
            <Button variant="primary" onClick={() => navigate('/matching')}>
              매칭하러 가기
            </Button>
          </div>
        </div>
      </DarkScope>
    )
  }

  // 권한이 없으면 세션 UI 자체를 그리지 않는다. 훅이 룸 연결도 끊어놓은 상태다.
  if (session.mediaDenied) {
    return (
      <DarkScope>
        <div className="mx-auto flex h-[100dvh] max-w-[440px] flex-col items-center justify-center gap-4 p-6 text-center">
          <Icon name="camera-off" size={40} className="text-faint" />
          <h1 className="bt-h3">세션에 들어갈 수 없어요</h1>
          <p className="bt-body-sm bt-muted">
            {session.error?.message ?? '카메라·마이크 권한이 필요해요.'} 화상 연습은 두 사람이 서로
            보고 들어야 진행돼요. 브라우저 주소창의 자물쇠 아이콘에서 권한을 허용한 뒤 다시
            시도해 주세요.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/')}>
              나가기
            </Button>
            <Button variant="primary" leadingIcon="refresh" onClick={session.retry}>
              다시 시도
            </Button>
          </div>
        </div>
      </DarkScope>
    )
  }

  return (
    <DarkScope>
      <div className="mx-auto flex h-[100dvh] max-w-[1280px] flex-col gap-3 p-3 sm:p-4">
        {/* 주 영역: 데스크탑 2단 / 모바일 적층 */}
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,1fr)_322px] lg:grid-rows-1">
          <SessionStage
            remoteVideo={session.remoteVideo}
            localVideo={session.localVideo}
            themeLabel={themeLabel}
            remainingSec={remainingSec ?? 0}
            connectionState={session.state}
            partnerJoined={session.partnerConnected}
            partnerName={partnerName}
            cameraDisabled={session.cameraDisabled}
          />

          {/* 모바일에서는 높이 고정 */}
          <aside className="h-[38vh] min-h-0 overflow-y-auto lg:h-auto">
            <CoachRail
              silenceHint={
                <SilenceHint
                  stage={silenceStage}
                  silenceSec={silenceSec}
                  topics={silenceTopics}
                  questions={silenceQuestions}
                  questionsState={silenceQuestions.length > 0 ? 'ready' : 'empty'}
                  onDismiss={realtime.dismissSilence}
                />
              }
              message={visibleMessage}
              onDismissMessage={() => setDismissedId(latest?.id ?? null)}
              safetyWarning={
                realtime.safety ? (
                  <SafetyWarningCard
                    message={realtime.safety.message}
                    recommendedAction={realtime.safety.recommendedAction}
                    occurrenceCount={realtime.safety.occurrenceCount}
                    onDismiss={realtime.dismissSafety}
                    onLeave={() => setEndConfirmOpen(true)}
                  />
                ) : undefined
              }
              goalLabel={missions[0]?.title ?? '대화 흐름 유지'}
              // 실시간 발화 비율을 내려주는 서버 경로가 없다 → 카드를 그리지 않는다.
              speakingRatio={null}
              missions={missions}
              extensionVisible={extensionVisible}
              extensionChoice={extensionChoice}
              onAcceptExtension={() => setExtensionChoice('accepted')}
              onDeclineExtension={() => setExtensionChoice('declined')}
            />
          </aside>
        </div>

        {/* 하단: 통화 컨트롤. 오류 배너는 흐름에 끼우지 않고 위로 띄운다 —
            흐름에 넣으면 오류가 뜰 때마다 컨트롤이 밀려 누르려던 버튼이 자리를 옮긴다. */}
        <footer className="relative flex flex-col items-center gap-2">
          {(session.error || actionError) && (
            <Callout tone="danger" className="bt-session-error" role="alert">
              {session.error?.message ?? actionError}
            </Callout>
          )}

          {/* 실시간 계층이 끊기면 코칭·침묵 힌트가 오지 않는다 — 조용히 죽지 않게 알린다 */}
          {!realtime.realtimeConnected && session.state === 'connected' && (
            <Callout tone="warning" className="bt-session-error">
              코칭 연결이 끊겼어요. 영상·음성은 계속 이어집니다.
            </Callout>
          )}

          {session.needsAudioUnlock && (
            <Button variant="tonal" size="sm" onClick={session.unlockAudio}>
              소리 켜기
            </Button>
          )}

          <CallControls
            muted={session.muted}
            cameraDisabled={session.cameraDisabled}
            mutePending={session.mutePending}
            cameraPending={session.cameraPending}
            onToggleMute={session.toggleMute}
            onToggleCamera={session.toggleCamera}
            onEnd={() => setEndConfirmOpen(true)}
            beforeEnd={
              <>
                <IconButton icon="help" aria-label="도움 요청" />
                {/* 신고는 파괴적이지만 빨강 아이콘 버튼은 통화 종료 전용이다(§3.3).
                    실제 경고는 열리는 모달에서 라벨과 함께 전달한다. */}
                {/* TODO(FE-A): 신고 화면(W-13)은 FE-A 담당이며 라우트·API 가 아직 없다 */}
                <IconButton icon="report" aria-label="신고하기" />
              </>
            }
          />
        </footer>
      </div>

      {/* 상대 오디오 — 화면에 그리지 않지만 반드시 마운트되어야 소리가 난다 */}
      <AudioTrackView track={session.remoteAudio} />

      <AlertDialog
        open={endConfirmOpen}
        onCancel={() => setEndConfirmOpen(false)}
        onConfirm={leaveSession}
        title="세션을 종료할까요?"
        description="지금 종료하면 남은 시간은 복구되지 않아요. 분석 리포트는 여기까지의 대화로 만들어집니다."
        tone="danger"
        confirmLabel="종료하기"
        confirmIcon="phone-end"
      />
    </DarkScope>
  )
}

/* ────────────────────────── 하위 조각 ────────────────────────── */

/**
 * 안전 경고 카드 (SAFETY-01).
 * 서버가 `recommendedAction: 'SHOW_REPORT_OR_LEAVE_OPTIONS'` 를 주면 나가기 선택지를 함께 준다.
 *
 * 🔒 이 경고도 **본인에게만** 전달된다(`/user/queue/.../safety`) — 상대는 모른다.
 */
function SafetyWarningCard({
  message,
  recommendedAction,
  occurrenceCount,
  onDismiss,
  onLeave,
}: {
  message: string
  recommendedAction: string
  occurrenceCount: number
  onDismiss: () => void
  onLeave: () => void
}) {
  const escalated = recommendedAction === 'SHOW_REPORT_OR_LEAVE_OPTIONS'
  return (
    <Callout tone={escalated ? 'danger' : 'warning'} role="alert">
      {message}
      {occurrenceCount > 1 && (
        <span className="bt-caption bt-muted mt-1 block">
          비슷한 상황이 <span className="bt-numeric">{occurrenceCount}</span>번 감지됐어요.
        </span>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          확인
        </Button>
        {escalated && (
          <Button variant="secondary" size="sm" onClick={onLeave}>
            세션 나가기
          </Button>
        )}
      </div>
    </Callout>
  )
}

/* ────────────────────────── 데이터 훅 ────────────────────────── */

/**
 * 남은 시간. **서버가 SSOT** 다.
 *  - 최초 값: `GET /sessions/{id}/status`
 *  - 보정: STOMP `/topic/sessions/{id}/timer` (1초 주기, 연장·조기 종료 반영)
 *  - 그 사이는 로컬에서 1초씩 깎아 표시만 매끄럽게 한다.
 *
 * 예전 구현은 30분을 하드코딩해 두 참가자의 타이머가 서로 어긋났다.
 */
function useServerTimer(sessionId: number | null, pushedRemaining: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (sessionId == null) return
    let alive = true
    getSessionStatus(sessionId)
      .then((snapshot) => alive && setRemaining(snapshot.remainingSeconds))
      .catch(() => {
        /* 실패하면 STOMP 첫 tick 을 기다린다 */
      })
    return () => {
      alive = false
    }
  }, [sessionId])

  // 서버가 밀어준 값이 항상 이긴다.
  useEffect(() => {
    if (pushedRemaining != null) setRemaining(pushedRemaining)
  }, [pushedRemaining])

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => (prev == null ? prev : Math.max(0, prev - 1)))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return remaining
}

/** sessionId 가 잘못된 경우에만 쓰이는 자리 채우기 — 실제로 연결을 시도하지 않는다. */
const notConfiguredProvider = async () => {
  throw new Error('세션 정보가 없어요.')
}
