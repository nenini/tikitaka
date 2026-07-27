import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertDialog, Button, CallControls, Callout, DarkScope, IconButton } from '@/components'
import { useCoachingStore } from '@/stores/coaching.store'
import { AudioTrackView } from './livekit/TrackView'
import { devTokenProvider } from './livekit/tokenProvider'
import { useLiveKitRoom } from './livekit/useLiveKitRoom'
import { CoachRail } from './components/CoachRail'
import { SessionStage } from './components/SessionStage'
import { SilenceHint } from './components/SilenceHint'
import type { SilenceTopic } from './components/SilenceHint'
import type { ExtensionChoice } from './components/ExtensionOfferCard'
import { useSilenceStage } from './useSilenceStage'

/** 30분 세션. 연장 제안은 종료 1분 전부터 노출된다. */
const SESSION_DURATION_SEC = 30 * 60
const EXTENSION_OFFER_AT_SEC = 60

// TODO(FE-SESSION-10): 추천 주제·질문은 GET /api/sessions/{id}/questions 로 교체.
//   LLM 호출 없이 사전 정의 풀에서 즉시 내려오는 값이라 프론트는 그대로 렌더만 한다.
const MOCK_TOPICS: readonly SilenceTopic[] = [
  { id: 'cafe', label: '☕ 카페 이야기' },
  { id: 'movie', label: '🎬 최근 본 영화' },
  { id: 'travel', label: '✈️ 여행' },
]
const MOCK_QUESTIONS = [
  { id: 'q1', text: '최근에 재밌게 본 영화나 드라마 있으세요?' },
  { id: 'q2', text: '주말엔 보통 어떻게 보내세요?' },
  { id: 'q3', text: '요즘 빠져 있는 취미가 있나요?' },
]

/**
 * W-12 화상 세션 (SESSION-01/02 · SILENCE-01/02).
 *
 * 레이아웃: 데스크탑은 [상대 영상 | 코치 레일 322px] 2단, 모바일은 [영상 / 코치 스트립] 세로 적층.
 * 디자인 시스템 §7.3 — 상대 얼굴이 주인공이므로 OS 설정과 무관하게 **항상 다크**(DarkScope).
 */
export function SessionPage() {
  const { sessionId = 'demo-room' } = useParams()
  const navigate = useNavigate()

  // getToken 이 매 렌더 새 함수면 훅의 effect 가 재실행되어 재연결된다 — 반드시 고정한다.
  // TODO(FE-REALTIME-09): 백엔드 준비 시 apiTokenProvider 로 교체.
  const getToken = useCallback(devTokenProvider, [])
  const session = useLiveKitRoom(sessionId, getToken)

  /* ── 세션 타이머 ── SessionTimer 는 값만 받으므로 카운트다운은 여기서 관리한다. */
  const [remainingSec, setRemainingSec] = useState(SESSION_DURATION_SEC)
  useEffect(() => {
    const timer = setInterval(() => setRemainingSec((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  /* ── 침묵 개입 ── */
  // TODO(FE-SESSION-07): 서버의 silence.detected / 로컬 VAD 가 lastVoiceAt 을 갱신하도록 연결.
  //   지금은 입장 시각을 기준으로 세므로 아무도 말하지 않으면 단계가 그대로 올라간다.
  const lastVoiceAtRef = useRef<number>(Date.now())
  const { stage, silenceSec } = useSilenceStage({
    lastVoiceAt: lastVoiceAtRef.current,
    enabled: session.state === 'connected',
  })

  /* ── 코칭 ── 한 번에 하나만 띄운다(원칙 2). 스토어의 마지막 메시지만 꺼내 쓴다. */
  const messages = useCoachingStore((s) => s.messages)
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const latest = messages.at(-1) ?? null
  const visibleMessage = latest && latest.id !== dismissedId ? latest : null

  /* ── 5분 연장 ── */
  const [extensionChoice, setExtensionChoice] = useState<ExtensionChoice>('pending')
  const extensionVisible = remainingSec <= EXTENSION_OFFER_AT_SEC && remainingSec > 0

  /* ── 종료 ── */
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  const leaveSession = useCallback(() => {
    session.disconnect()
    // TODO(FE-SESSION-06): 상호 평가(W-14)로 전이. 지금은 홈으로.
    navigate('/')
  }, [session, navigate])

  // 상대의 트랙이 하나라도 잡히면 입장한 것으로 본다.
  // TODO: 카메라·마이크를 모두 끄고 들어온 상대는 감지되지 않는다 —
  //   useLiveKitRoom 이 ParticipantConnected 를 상태로 노출하면 그걸 쓰는 게 정확하다.
  const partnerJoined = Boolean(session.remoteVideo || session.remoteAudio)

  return (
    <DarkScope>
      <div className="mx-auto flex h-[100dvh] max-w-[1280px] flex-col gap-3 p-3 sm:p-4">
        {/* 주 영역: 데스크탑 2단 / 모바일 적층 */}
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,1fr)_322px] lg:grid-rows-1">
          <SessionStage
            remoteVideo={session.remoteVideo}
            localVideo={session.localVideo}
            themeLabel="🍽 저녁 식당"
            remainingSec={remainingSec}
            connectionState={session.state}
            partnerJoined={partnerJoined}
            cameraDisabled={session.cameraDisabled}
            silenceHint={
              <SilenceHint
                stage={stage}
                silenceSec={silenceSec}
                topics={MOCK_TOPICS}
                questions={MOCK_QUESTIONS}
                questionsState="ready"
                onPickTopic={() => {
                  // 힌트를 쓰면 침묵 계측을 리셋한다 — 사용자가 이미 행동했으므로 더 개입하지 않는다.
                  lastVoiceAtRef.current = Date.now()
                }}
                onPickQuestion={() => {
                  lastVoiceAtRef.current = Date.now()
                }}
              />
            }
          />

          <aside className="max-h-[38vh] min-h-0 overflow-y-auto lg:max-h-none">
            <CoachRail
              message={visibleMessage}
              onDismissMessage={() => setDismissedId(latest?.id ?? null)}
              goalLabel="발화량 줄이기"
              // TODO(FE-SESSION-08): session_metric_summaries.speakingRatio 실시간 값으로 교체.
              speakingRatio={68}
              extensionVisible={extensionVisible}
              extensionChoice={extensionChoice}
              onAcceptExtension={() => setExtensionChoice('accepted')}
              onDeclineExtension={() => setExtensionChoice('declined')}
            />
          </aside>
        </div>

        {/* 하단: 통화 컨트롤 */}
        <footer className="flex flex-col items-center gap-2">
          {session.error && <Callout tone="danger">{session.error.message}</Callout>}

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
                {/* TODO(FE-SESSION-11): 신고 모달(W-13) 연결 */}
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
