import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Badge,
  Button,
  Callout,
  Card,
  Cluster,
  DarkScope,
  Icon,
  SessionTimer,
  Spinner,
  TagChip,
} from '@/components'
import { useSessionStore } from '@/stores/session.store'
import { useDeviceCheck } from './useDeviceCheck'
import { emojiForPlaceType, fetchRoomBundle, joinSession, themeForHour } from './api'
import type { DeviceStatus, RoomBundle } from './types'

/**
 * W-11 상황형 대기방 · 기기 점검 (ROOM-01/03, FE-B).
 * 세션과 마찬가지로 항상 다크(디자인 시스템 §7.3) → DarkScope.
 * 기기 점검은 클라 전용(getUserMedia)이고, 테마·목표만 서버 번들로 받는다.
 * 분석 동의 상태는 화면에 노출하지 않는다(가입 W-02 에서 이미 처리 · 규칙).
 */
export function WaitingRoomPage() {
  const { sessionId = 'demo' } = useParams()
  const navigate = useNavigate()
  const setPhase = useSessionStore((s) => s.setPhase)
  const setSessionId = useSessionStore((s) => s.setSessionId)

  const device = useDeviceCheck()
  const { bundle, loading } = useRoomBundle(sessionId)
  const remainingSec = useStartCountdown(bundle?.scheduledStartAt)

  // 상대 입장 대기 상태. TODO(FE-B WS): STOMP 'participant-joined'/'session-ready' 이벤트로 갱신
  const [opponentJoined] = useState(false)

  const [joining, setJoining] = useState(false)

  useEffect(() => {
    setPhase('waiting-room')
    setSessionId(sessionId)
  }, [sessionId, setPhase, setSessionId])

  const themeEmoji = bundle ? emojiForPlaceType(bundle.theme.placeType) : '🍽'

  async function handleEnter() {
    if (!device.ready || joining) return
    setJoining(true)
    try {
      await joinSession(sessionId).catch(() => {
        // 데모/오프라인: 서버 join 실패해도 세션 화면으로는 넘어간다(연결은 트랙 2에서)
      })
      setPhase('connecting')
      navigate(`/session/${sessionId}`)
    } finally {
      setJoining(false)
    }
  }

  return (
    <DarkScope className="flex min-h-full flex-col">
      {/* 앱바 */}
      <header className="flex items-center justify-between px-5 py-4">
        <Cluster gap={8} style={{ alignItems: 'center' }}>
          <Icon name="bloom" size={22} style={{ color: 'var(--bt-color-brand)' }} />
          <span className="bt-body-sm bt-muted">상황형 대기방 · 기기 점검</span>
        </Cluster>
        {remainingSec != null && <SessionTimer remainingSec={remainingSec} label="시작까지" />}
      </header>

      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-4 px-5 pb-8 lg:flex-row">
        {/* ── 좌: 카메라 미리보기 ── */}
        <section className="flex flex-1 flex-col gap-3">
          <Cluster gap={8} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Cluster gap={8} style={{ alignItems: 'center' }}>
              <TagChip>
                {themeEmoji} {bundle?.theme.name ?? '상황 테마 배정 중'}
              </TagChip>
              {bundle && (
                <span className="bt-caption text-faint">
                  {bundle.theme.startTime}~{bundle.theme.endTime} 자동 배정
                </span>
              )}
            </Cluster>
          </Cluster>

          <CameraPreview status={device.camera} videoRef={device.videoRef} />
        </section>

        {/* ── 우: 점검 패널 ── */}
        <aside className="flex w-full flex-col gap-3 lg:w-[380px]">
          <div>
            <h1 className="bt-h2">입장 전 기기를 점검해요</h1>
            <p className="bt-body-sm bt-muted mt-1">카메라·스피커·마이크를 한 번에 확인하세요.</p>
          </div>

          {device.errorReason && (
            <Callout tone="danger">
              {device.errorReason}
              <div className="mt-2">
                <Button variant="secondary" size="sm" leadingIcon="refresh" onClick={device.retry}>
                  다시 점검
                </Button>
              </div>
            </Callout>
          )}

          {/* 카메라 */}
          <DeviceCard icon="camera" label="카메라" status={device.camera}>
            원 안에 얼굴이 또렷하게 잡혔는지 확인해요.
          </DeviceCard>

          {/* 스피커 — 사용자가 직접 테스트음으로 확인 */}
          <Card>
            <div className="flex items-center justify-between">
              <Cluster gap={8} style={{ alignItems: 'center' }}>
                <Icon name="bell" size={18} />
                <b className="bt-body-sm">스피커</b>
              </Cluster>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon="bell"
                onClick={device.playTestTone}
                disabled={device.speakerPlaying}
              >
                {device.speakerPlaying ? '재생 중…' : '테스트음 재생'}
              </Button>
            </div>
            <SpeakerWave playing={device.speakerPlaying} />
            <p className="bt-caption bt-muted mt-1">소리가 들리면 정상이에요.</p>
          </Card>

          {/* 마이크 — 실시간 입력 레벨 */}
          <Card>
            <div className="flex items-center justify-between">
              <Cluster gap={8} style={{ alignItems: 'center' }}>
                <Icon name="mic" size={18} />
                <b className="bt-body-sm">마이크</b>
              </Cluster>
              <StatusBadge status={device.microphone} />
            </div>
            <MicMeter meterRef={device.meterRef} active={device.microphone === 'ready'} />
            <p className="bt-caption bt-muted mt-1">
              "안녕하세요"라고 말해보세요 — 막대가 움직이면 정상이에요.
            </p>
          </Card>

          {/* 이번 세션 목표 */}
          {bundle?.practiceGoal && (
            <Card variant="inset">
              <span className="bt-caption text-faint">이번 세션 목표</span>
              <p className="bt-body-sm mt-1">🎯 {bundle.practiceGoal}</p>
            </Card>
          )}

          {/* 규칙 안내 배너 */}
          <Callout tone="info">
            AI 코칭은 <b>나에게만</b> 보여요 · 침묵 10초까지는 개입하지 않아요 · 언제든 신고·퇴장할 수
            있어요.
          </Callout>

          {/* 상대 입장 대기 */}
          <Cluster gap={8} style={{ alignItems: 'center' }}>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: opponentJoined ? 'var(--bt-color-success)' : 'var(--bt-color-text-tertiary)',
              }}
              aria-hidden="true"
            />
            <span className="bt-caption bt-muted">
              {opponentJoined ? '상대가 입장했어요' : '상대 입장 대기 중…'}
            </span>
          </Cluster>

          {/* 입장 CTA */}
          <Button
            variant="primary"
            block
            size="lg"
            loading={joining}
            disabled={!device.ready || loading}
            onClick={handleEnter}
          >
            {device.ready ? '입장하기' : '기기 점검 중…'}
          </Button>
          {!device.ready && !device.errorReason && (
            <p className="bt-caption text-faint text-center">
              카메라·마이크가 준비되면 입장할 수 있어요.
            </p>
          )}
        </aside>
      </div>
    </DarkScope>
  )
}

/* ────────────────────────── 하위 조각 ────────────────────────── */

/** 카메라 미리보기 타일 — 얼굴 가이드 원 + 상태 칩. 영상은 좌우 반전(셀피). */
function CameraPreview({
  status,
  videoRef,
}: {
  status: DeviceStatus
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  return (
    <div
      className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl"
      style={{ background: 'var(--bt-color-surface-sunken)', minHeight: 300 }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)', display: status === 'ready' ? 'block' : 'none' }}
      />

      {status !== 'ready' && (
        <div className="flex flex-col items-center gap-2">
          {status === 'checking' ? (
            <>
              <Spinner />
              <span className="bt-caption bt-muted">카메라를 여는 중…</span>
            </>
          ) : (
            <>
              <Icon name="camera-off" size={28} style={{ color: 'var(--bt-color-text-tertiary)' }} />
              <span className="bt-caption bt-muted">카메라 미리보기를 볼 수 없어요</span>
            </>
          )}
        </div>
      )}

      {/* 얼굴 위치 가이드 원 */}
      {status === 'ready' && (
        <>
          <div
            className="pointer-events-none absolute rounded-[50%]"
            style={{
              width: 210,
              height: 270,
              border: '2px dashed rgba(255,255,255,.55)',
            }}
            aria-hidden="true"
          />
          <div className="absolute top-3 left-1/2 -translate-x-1/2">
            <Badge tone="success">원 안에 얼굴을 맞춰주세요</Badge>
          </div>
        </>
      )}
    </div>
  )
}

/** 상태 뱃지가 붙은 기기 카드(카메라 등 자동 판정용). */
function DeviceCard({
  icon,
  label,
  status,
  children,
}: {
  icon: 'camera' | 'mic'
  label: string
  status: DeviceStatus
  children: React.ReactNode
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Cluster gap={8} style={{ alignItems: 'center' }}>
          <Icon name={icon} size={18} />
          <b className="bt-body-sm">{label}</b>
        </Cluster>
        <StatusBadge status={status} />
      </div>
      <p className="bt-caption bt-muted mt-1">{children}</p>
    </Card>
  )
}

/** DeviceStatus → 뱃지. */
function StatusBadge({ status }: { status: DeviceStatus }) {
  switch (status) {
    case 'ready':
      return <Badge tone="success">정상</Badge>
    case 'checking':
      return <Badge tone="info">확인 중</Badge>
    case 'error':
      return <Badge tone="danger">오류</Badge>
    default:
      return <Badge tone="neutral">대기</Badge>
  }
}

/** 마이크 실시간 입력 레벨 바. 채우기 <i> 의 width 는 훅이 ref 로 직접 갱신한다. */
function MicMeter({
  meterRef,
  active,
}: {
  meterRef: React.RefObject<HTMLElement | null>
  active: boolean
}) {
  return (
    <div
      className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--bt-color-surface-sunken)' }}
    >
      <i
        ref={meterRef as React.RefObject<HTMLElement>}
        className="block h-full rounded-full transition-[width] duration-75"
        style={{ width: '0%', background: active ? 'var(--bt-color-success)' : 'var(--bt-color-text-tertiary)' }}
      />
    </div>
  )
}

/** 스피커 테스트음 파형 — 재생 중일 때만 살아 움직인다. */
function SpeakerWave({ playing }: { playing: boolean }) {
  const bars = [8, 15, 20, 12, 17, 9, 14]
  return (
    <div className="mt-2 flex h-5 items-center gap-1" aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className={playing ? 'animate-pulse' : undefined}
          style={{
            width: 3,
            height: playing ? h : 4,
            borderRadius: 2,
            background: playing ? 'var(--bt-color-brand)' : 'var(--bt-color-text-tertiary)',
            animationDelay: `${i * 80}ms`,
            transition: 'height 120ms ease',
          }}
        />
      ))}
    </div>
  )
}

/* ────────────────────────── 데이터 훅 ────────────────────────── */

/** 룸 번들 조회 — 서버 실패 시 현재 시각 기준 테마로 폴백(데모/오프라인). */
function useRoomBundle(sessionId: string) {
  const [bundle, setBundle] = useState<RoomBundle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchRoomBundle(sessionId)
      .then((b) => {
        if (alive) setBundle(b)
      })
      .catch(() => {
        if (!alive) return
        const { theme } = themeForHour(new Date().getHours())
        setBundle({
          sessionId,
          scheduledStartAt: new Date(Date.now() + 3 * 60_000).toISOString(),
          theme,
          practiceGoal: '대화를 끊기지 않게 이어가기',
        })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sessionId])

  return { bundle, loading }
}

/** scheduledStartAt 까지 남은 초. 1초마다 갱신(음수는 0). */
function useStartCountdown(scheduledStartAt: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())
  const targetRef = useRef<number | null>(null)
  targetRef.current = scheduledStartAt ? new Date(scheduledStartAt).getTime() : null

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (targetRef.current == null) return null
  return Math.max(0, Math.round((targetRef.current - now) / 1000))
}
