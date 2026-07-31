import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { errorMessageOf } from '@/shared/api/envelope'
import { useStomp, useStompSubscription } from '@/shared/realtime/useStomp'
import { joinSession } from '@/features/session/api'
import { snapshotAnalysisSettings } from '@/features/session/vision'
import { roomParticipantsTopic } from '@/features/session/types'
import { useDeviceCheck } from './useDeviceCheck'
import {
  cancelReady,
  fetchRoomBundle,
  getLatestDeviceCheck,
  getParticipantsStatus,
  markReady,
  saveDeviceCheck,
} from './api'
import { ENTRY_STATUS_TEXT } from './types'
import type {
  DeviceStatus,
  RoomBundle,
  RoomParticipantStatusChangedEvent,
  RoomParticipantsStatus,
} from './types'

/**
 * W-11 상황형 대기방 · 기기 점검 (ROOM-01/03, FE-B).
 * 세션과 마찬가지로 항상 다크(디자인 시스템 §7.3) → DarkScope.
 *
 * 백엔드 연동 (`roomId` == `sessionId`)
 *  - `GET /api/v1/rooms/{id}` 상세 + **서버가 판정하는 입장 게이트**(`canEnter`/`entryStatus`)
 *  - `POST /api/v1/rooms/{id}/device-check` 점검 결과 저장 → `readyAvailable`
 *  - `POST/DELETE /api/v1/rooms/{id}/ready` 준비 토글
 *  - `GET /api/v1/rooms/{id}/participants/status` + STOMP `/topic/rooms/{id}/participants`
 *  - `POST /api/v1/sessions/{id}/join` 입장
 *
 * 진행 순서: 기기 점검 → (서버 저장) → 준비 완료 → 양측 준비 → 입장.
 * 서버는 `allReady` 일 때만 세션을 READY 로 올리고, READY 가 아니면 join 이 409 다.
 */

/** 준비 현황 폴백 폴링 주기. STOMP 가 끊겨도 상대 준비를 놓치지 않게 한다. */
const PARTICIPANTS_POLL_MS = 3_000
export function WaitingRoomPage() {
  const { sessionId: sessionIdParam } = useParams()
  const navigate = useNavigate()
  const setPhase = useSessionStore((s) => s.setPhase)
  const setSessionId = useSessionStore((s) => s.setSessionId)

  const roomId = Number(sessionIdParam)
  const validRoom = Number.isFinite(roomId) && roomId > 0

  const device = useDeviceCheck()
  const { bundle, loading, error: bundleError, reload } = useRoomBundle(validRoom ? roomId : null)
  const remainingSec = useStartCountdown(bundle?.scheduledStartAt)

  const [readyAvailable, setReadyAvailable] = useState(false)
  const [participants, setParticipants] = useState<RoomParticipantsStatus | null>(null)
  const [togglingReady, setTogglingReady] = useState(false)
  const [joining, setJoining] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!validRoom) return
    setPhase('waiting-room')
    setSessionId(String(roomId))
  }, [validRoom, roomId, setPhase, setSessionId])

  /* ── 준비 현황: 최초 조회 + STOMP 구독 ── */

  const { connection } = useStomp(validRoom)
  const topic = useMemo(() => (validRoom ? roomParticipantsTopic(roomId) : null), [validRoom, roomId])

  /**
   * 준비 현황 조회.
   *
   * STOMP 푸시가 있으면 즉시 반영되지만, **푸시만 믿으면 소켓이 끊긴 동안 화면이 멈춘다**
   * (상대가 준비해도 입장 버튼이 열리지 않는다). 그래서 양측 준비가 끝날 때까지는
   * 짧은 주기로 REST 폴링도 함께 돌린다 — 2인 방이라 비용이 거의 없다.
   */
  const allReadyRef = useRef(false)
  useEffect(() => {
    if (!validRoom) return
    let alive = true

    const sync = () =>
      getParticipantsStatus(roomId)
        .then((status) => {
          if (!alive) return
          setParticipants(status)
          // 양측 준비 완료 시점에 세션이 READY 로 올라간다 → 입장 게이트를 다시 읽는다.
          if (status.allReady && !allReadyRef.current) void reload()
          allReadyRef.current = status.allReady
        })
        .catch(() => {
          /* 일시 실패는 다음 주기에 회복한다 */
        })

    void sync()
    const timer = setInterval(() => {
      if (!allReadyRef.current) void sync()
    }, PARTICIPANTS_POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [validRoom, roomId, reload])

  useStompSubscription(connection, topic, (body) => {
    const event = body as RoomParticipantStatusChangedEvent
    if (event?.roomId == null) return
    setParticipants({
      roomId: event.roomId,
      allReady: event.allReady,
      participants: event.participants,
    })
    // 양측 준비가 끝나면 세션 상태가 READY 로 올라간다 → 입장 게이트를 다시 읽는다.
    if (event.allReady && !allReadyRef.current) void reload()
    allReadyRef.current = event.allReady
  })

  /* ── 기기 점검 결과 서버 저장 ── */

  // 이미 저장된 점검 결과가 있으면 그 판정을 이어받는다(새로고침 대비).
  useEffect(() => {
    if (!validRoom) return
    let alive = true
    getLatestDeviceCheck(roomId)
      .then((latest) => {
        if (alive && latest) setReadyAvailable(latest.readyAvailable)
      })
      .catch(() => {
        /* 없으면 아래에서 새로 저장한다 */
      })
    return () => {
      alive = false
    }
  }, [validRoom, roomId])

  // 4개 항목이 모두 통과한 순간 한 번만 저장한다. 점검 상태가 오락가락할 때마다 POST 하면
  // 서버에 점검 이력이 쓸데없이 쌓인다.
  const savedRef = useRef(false)
  useEffect(() => {
    if (!validRoom || !device.allPassed || savedRef.current) return
    savedRef.current = true

    saveDeviceCheck(roomId, {
      cameraPassed: device.camera === 'ready',
      microphonePassed: device.microphone === 'ready',
      speakerPassed: device.speakerTested,
      networkPassed: device.network === 'ready',
    })
      .then((result) => setReadyAvailable(result.readyAvailable))
      .catch((error) => {
        // 저장 실패 시 다시 시도할 수 있게 플래그를 되돌린다.
        savedRef.current = false
        setActionError(errorMessageOf(error, '기기 점검 결과를 저장하지 못했어요.'))
      })
  }, [
    validRoom,
    roomId,
    device.allPassed,
    device.camera,
    device.microphone,
    device.speakerTested,
    device.network,
  ])

  /* ── 준비 토글 · 입장 ── */

  const readyCount = participants?.participants.filter((p) => p.ready).length ?? 0
  const allReady = participants?.allReady ?? false
  // 서버 응답에 "나"를 표시하는 필드가 없다(userId 만 온다) →
  // 준비한 사람이 1명 이상이고 전원 준비가 아니면 그게 나인지 상대인지 알 수 없다.
  // 그래서 내 준비 여부는 내가 누른 결과(낙관적 상태)로만 추적한다.
  const [myReady, setMyReady] = useState(false)
  const otherReady = allReady || (myReady ? readyCount >= 2 : readyCount >= 1)

  async function toggleReady() {
    if (!validRoom || togglingReady) return
    setTogglingReady(true)
    setActionError(null)
    try {
      const next = myReady ? await cancelReady(roomId) : await markReady(roomId)
      setParticipants(next)
      setMyReady(!myReady)
      if (next.allReady) await reload()
    } catch (error) {
      setActionError(errorMessageOf(error, '준비 상태를 변경하지 못했어요.'))
    } finally {
      setTogglingReady(false)
    }
  }

  async function handleEnter() {
    if (!validRoom || joining) return
    setJoining(true)
    setActionError(null)
    try {
      // 표정·음성 분석 플래그를 입장 직전에 1회 스냅샷한다(기능명세서 v4 §8).
      // 세션이 IN_PROGRESS 가 되면 PATCH 가 409 라, 여기가 마지막 기회다.
      // 실패해도 입장은 막지 않는다 — 그 경우 표정 분석만 꺼진 채로 진행된다.
      await snapshotAnalysisSettings(roomId)
      await joinSession(roomId)
      setPhase('connecting')
      navigate(`/session/${roomId}`)
    } catch (error) {
      setActionError(errorMessageOf(error, '입장하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setJoining(false)
    }
  }

  if (!validRoom) {
    // 대기방은 매칭이 확정돼야 생긴다(roomId == sessionId). 링크를 직접 열었거나
    // 아직 방이 없는 상태라면 매칭 흐름으로 돌려보내는 게 유일한 출구다.
    return (
      <DarkScope fill={false} className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="flex max-w-[380px] flex-col items-center gap-3">
          <Icon name="error-circle" size={32} className="text-faint" />
          <b className="bt-h3">대기방을 찾을 수 없어요</b>
          <p className="bt-body-sm bt-muted">
            대기방은 매칭이 확정된 뒤에 열려요. 매칭 카드에서 양쪽이 수락하면 이 화면으로 이동해요.
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

  return (
    <DarkScope fill={false} className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      {/* 앱바 */}
      <header className="flex shrink-0 items-center justify-between px-5 py-4">
        <Cluster gap={8} style={{ alignItems: 'center' }}>
          <Icon name="bloom" size={22} style={{ color: 'var(--bt-color-brand)' }} />
          <span className="bt-body-sm bt-muted">상황형 대기방 · 기기 점검</span>
        </Cluster>
        {remainingSec != null && <SessionTimer remainingSec={remainingSec} label="시작까지" />}
      </header>

      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-4 px-5 pb-8 lg:min-h-0 lg:flex-row lg:pb-5">
        {/* ── 좌: 카메라 미리보기 ── */}
        <section className="flex flex-1 flex-col gap-3 lg:min-h-0">
          <Cluster gap={8} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Cluster gap={8} style={{ alignItems: 'center' }}>
              <TagChip>
                {bundle ? `${bundle.themeEmoji} ${bundle.theme.name}` : '상황 테마 배정 중'}
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

        {/* ── 우: 점검 패널 — 데스크탑은 헤딩/CTA 고정 + 카드 영역만 내부 스크롤 ── */}
        <aside className="flex w-full flex-col gap-3 lg:min-h-0 lg:w-[380px]">
          <div className="shrink-0">
            <h1 className="bt-h2">입장 전 기기를 점검해요</h1>
            <p className="bt-body-sm bt-muted mt-1">카메라·스피커·마이크를 한 번에 확인하세요.</p>
          </div>

          {/* 점검 카드 영역 (데스크탑에서만 내부 스크롤) */}
          <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {(bundleError || actionError) && (
              <Callout tone="danger">
                {bundleError ?? actionError}
                {bundleError && (
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon="refresh"
                      onClick={() => void reload()}
                    >
                      다시 불러오기
                    </Button>
                  </div>
                )}
              </Callout>
            )}

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

            {/* 스피커 — 사용자가 직접 테스트음으로 확인. 서버가 speakerPassed 를 요구한다 */}
            <Card>
              <div className="flex items-center justify-between">
                <Cluster gap={8} style={{ alignItems: 'center' }}>
                  <Icon name="speaker" size={18} />
                  <b className="bt-body-sm">스피커</b>
                </Cluster>
                <Cluster gap={8} style={{ alignItems: 'center' }}>
                  {device.speakerTested && <Badge tone="success">확인</Badge>}
                  <Button
                    variant="secondary"
                    size="sm"
                    leadingIcon="speaker"
                    onClick={device.playTestTone}
                    disabled={device.speakerPlaying}
                  >
                    {device.speakerPlaying ? '재생 중…' : '테스트음 재생'}
                  </Button>
                </Cluster>
              </div>
              <SpeakerWave playing={device.speakerPlaying} />
              <p className="bt-caption bt-muted mt-1">
                {device.speakerTested
                  ? '소리가 들렸다면 그대로 진행하세요.'
                  : '테스트음을 한 번 재생해야 준비 완료할 수 있어요.'}
              </p>
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

            {/* 네트워크 — 서버가 networkPassed 를 요구한다 */}
            <DeviceCard icon="signal" label="네트워크" status={device.network}>
              {device.network === 'ready'
                ? '연결이 확인됐어요.'
                : '인터넷 연결이 끊겼어요. 연결을 확인해 주세요.'}
            </DeviceCard>

            {/* 이번 세션 목표 */}
            {bundle?.practiceGoal && (
              <Card variant="inset">
                <span className="bt-caption text-faint">이번 세션 목표</span>
                <p className="bt-body-sm mt-1 flex items-start gap-2">
                  <Icon
                    name="target"
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: 'var(--bt-color-action)' }}
                  />
                  {bundle.practiceGoal}
                </p>
              </Card>
            )}

            {/* 규칙 안내 — 성격이 다른 세 가지라 목록으로 나눈다(가운뎃점으로 이으면 하나도 안 읽힌다) */}
            <Callout tone="info">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                <li>AI 코칭은 나에게만 보여요.</li>
                <li>침묵 10초까지는 개입하지 않아요.</li>
                <li>언제든 신고하거나 나갈 수 있어요.</li>
              </ul>
            </Callout>
          </div>

          {/* 하단 고정: 준비 현황 + 준비/입장 CTA */}
          <div className="flex shrink-0 flex-col gap-2">
            <Cluster gap={8} style={{ alignItems: 'center' }}>
              <Icon
                name={otherReady ? 'check-circle' : 'clock'}
                size={15}
                style={{
                  color: otherReady ? 'var(--bt-color-success)' : 'var(--bt-color-text-tertiary)',
                }}
              />
              <span className="bt-caption bt-muted">
                {allReady
                  ? '두 사람 모두 준비됐어요'
                  : otherReady
                    ? '상대가 준비했어요'
                    : '상대 준비 대기 중…'}
              </span>
            </Cluster>

            {/* CTA 가 잠긴 이유는 CTA 옆에 있어야 한다 — 카드까지 눈을 올려 원인을 찾게 하지 않는다 */}
            <BlockingHint
              camera={device.camera}
              microphone={device.microphone}
              network={device.network}
              speakerTested={device.speakerTested}
              allPassed={device.allPassed}
              readyAvailable={readyAvailable}
              myReady={myReady}
              allReady={allReady}
              entryText={bundle && !bundle.canEnter ? ENTRY_STATUS_TEXT[bundle.entryStatus] : ''}
              loading={loading}
            />

            {/* 준비 전에는 '준비 완료', 양측 준비 후에는 '입장하기'로 바뀐다 */}
            {allReady && bundle?.canEnter ? (
              <Button variant="primary" block size="lg" loading={joining} onClick={handleEnter}>
                입장하기
              </Button>
            ) : (
              <Button
                variant={myReady ? 'secondary' : 'primary'}
                block
                size="lg"
                loading={togglingReady}
                disabled={!myReady && (!device.allPassed || !readyAvailable || loading)}
                onClick={toggleReady}
              >
                {myReady ? '준비 해제' : device.allPassed ? '준비 완료' : '기기 점검 중…'}
              </Button>
            )}
          </div>
        </aside>
      </div>
    </DarkScope>
  )
}

/* ────────────────────────── 하위 조각 ────────────────────────── */

/**
 * 카메라 미리보기 타일 — 얼굴 가이드 타원 + 상태 칩. 영상은 좌우 반전(셀피).
 *
 * 크기는 전부 **비율 기반**이다. 가이드 타원을 px 로 고정하면 좁은 화면에서 타일 밖으로 삐져나간다.
 */
function CameraPreview({
  status,
  videoRef,
}: {
  status: DeviceStatus
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  return (
    <div
      className="relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-2xl"
      style={{
        background: 'var(--bt-color-surface-sunken)',
        // 세로 배치(모바일)에서는 16:9 로 자리를 잡고, 가로 2단(데스크탑)에서는 남는 높이를 채운다.
        // 최소 높이도 vh 로 둬서 작은 화면에서 타일이 찌그러지지 않게 한다(px 고정 금지).
        aspectRatio: '16 / 9',
        minHeight: '32vh',
      }}
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

      {/* 얼굴 위치 가이드 — 타일 높이의 72%, 세로:가로 = 1:0.78 비율 */}
      {status === 'ready' && (
        <>
          <div
            className="pointer-events-none absolute rounded-[50%]"
            style={{
              height: '72%',
              aspectRatio: '0.78',
              maxWidth: '80%',
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

/**
 * CTA 바로 위의 차단 원인 안내. 무엇이 왜 막고 있는지를 **버튼 옆에서** 말한다.
 * 막는 것이 없으면 아무것도 그리지 않는다.
 */
function BlockingHint({
  camera,
  microphone,
  network,
  speakerTested,
  allPassed,
  readyAvailable,
  myReady,
  allReady,
  entryText,
  loading,
}: {
  camera: DeviceStatus
  microphone: DeviceStatus
  network: DeviceStatus
  speakerTested: boolean
  allPassed: boolean
  readyAvailable: boolean
  myReady: boolean
  allReady: boolean
  entryText: string
  loading: boolean
}) {
  const failed = [
    camera === 'error' && '카메라',
    microphone === 'error' && '마이크',
    network === 'error' && '네트워크',
  ].filter((v): v is string => typeof v === 'string')

  if (failed.length > 0) {
    return (
      <p
        className="bt-caption flex items-center justify-center gap-1.5"
        style={{ color: 'var(--bt-color-danger)' }}
      >
        <Icon name="error-circle" size={14} />
        {failed.join('·')}가 연결되지 않아 준비할 수 없어요
      </p>
    )
  }

  // 양측 준비가 끝났는데도 입장이 막혔다면 서버 입장 게이트 사유를 그대로 보여준다.
  if (allReady && entryText) {
    return <p className="bt-caption text-faint text-center">{entryText}</p>
  }

  // 서버가 이미 "전 항목 통과"로 판정했으면 기기 안내를 더 띄우지 않는다.
  // (새로고침·HMR 로 로컬 점검 상태만 초기화된 경우에도 서버 판정을 신뢰한다)
  if (!readyAvailable) {
    if (!speakerTested) {
      return <p className="bt-caption text-faint text-center">스피커 테스트음을 한 번 재생해 주세요.</p>
    }
    if (!allPassed) {
      return (
        <p className="bt-caption text-faint text-center">
          {loading ? '대기방 정보를 불러오는 중이에요.' : '기기 점검이 끝나면 준비할 수 있어요.'}
        </p>
      )
    }
    return <p className="bt-caption text-faint text-center">점검 결과를 저장하는 중이에요.</p>
  }

  if (myReady && !allReady) {
    return <p className="bt-caption text-faint text-center">상대가 준비하면 바로 입장할 수 있어요.</p>
  }

  return null
}

/** 상태 뱃지가 붙은 기기 카드(카메라·네트워크 등 자동 판정용). */
function DeviceCard({
  icon,
  label,
  status,
  children,
}: {
  icon: 'camera' | 'mic' | 'signal'
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
      return <Badge tone="danger">미연결</Badge>
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
        style={{
          width: '0%',
          background: active ? 'var(--bt-color-success)' : 'var(--bt-color-text-tertiary)',
        }}
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

/** 대기방 상세 조회. 폴백 없이 오류를 그대로 올린다 — 화면이 원인을 말하게 한다. */
function useRoomBundle(roomId: number | null) {
  const [bundle, setBundle] = useState<RoomBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (roomId == null) return
    try {
      setBundle(await fetchRoomBundle(roomId))
      setError(null)
    } catch (loadError) {
      setError(errorMessageOf(loadError, '대기방 정보를 불러오지 못했어요.'))
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    if (roomId == null) {
      setLoading(false)
      return
    }
    setLoading(true)
    void reload()
  }, [roomId, reload])

  return { bundle, loading, error, reload }
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
