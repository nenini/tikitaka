import type { ReactNode } from 'react'
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { Badge, ConnectionIndicator, Icon, SessionTimer, Spinner } from '@/components'
import type { ConnectionState } from '@/components'
import { VideoTrackView } from '../livekit/TrackView'

export interface SessionStageProps {
  remoteVideo: RemoteVideoTrack | null
  localVideo: LocalVideoTrack | null
  /** 대기방에서 고른 상황 테마 (예: "저녁 식당") */
  themeLabel?: string
  remainingSec: number
  connectionState: ConnectionState
  /** 상대가 룸에 들어와 있는가 */
  partnerJoined: boolean
  partnerName?: string
  /** 내 카메라를 끈 상태 — PIP 에 표시한다 */
  cameraDisabled: boolean
  /** 카메라 쪽(상단 중앙)에 띄우는 코칭 카드. 아래 배치 주석 참고 */
  coachOverlay?: ReactNode
}

/**
 * 세션 주 화면 — 상대 영상이 주인공이다.
 *
 * 오버레이 배치 규칙(§10): 코칭·힌트는 **상대 얼굴을 가리지 않는다.**
 * 얇은 메타 정보(테마·타이머·연결 상태)와 PIP, 그리고 상단 중앙의 코칭 카드만 영상 위에 올린다.
 * 침묵 힌트·안전 경고·연장 제안은 그대로 코치 레일에서 그린다.
 */
export function SessionStage({
  remoteVideo,
  localVideo,
  themeLabel,
  remainingSec,
  connectionState,
  partnerJoined,
  partnerName,
  cameraDisabled,
  coachOverlay,
}: SessionStageProps) {
  return (
    <div
      className="relative isolate h-full w-full overflow-hidden rounded-xl"
      style={{ background: 'var(--bt-mist-950)' }}
    >
      {/* 상대 영상 (주 화면) */}
      {partnerJoined && remoteVideo ? (
        <VideoTrackView track={remoteVideo} />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            {partnerJoined ? (
              // 들어와 있는데 영상이 없다 = 상대가 카메라를 껐다. 연결 문제와 구분해서 알린다.
              <>
                <Icon name="camera-off" size={28} className="text-faint" />
                <p className="bt-body-sm bt-muted">상대가 카메라를 껐어요</p>
              </>
            ) : (
              <>
                <Spinner size={24} label={null} />
                <p className="bt-body-sm bt-muted">상대를 기다리고 있어요</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* 상단 좌: 상황 테마 + 상대 표기 · 상단 우: 타이머 + 연결 상태
          최소 공개 원칙(§4.1) — 여기 올라가는 건 닉네임·연령대까지다. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {themeLabel && <Badge tone="neutral">{themeLabel}</Badge>}
          {partnerJoined && partnerName && <Badge tone="neutral">{partnerName}</Badge>}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <ConnectionIndicator state={connectionState} />
          <SessionTimer remainingSec={remainingSec} />
        </div>
      </div>

      {/* 상단 중앙: 코칭 카드.
          **웹캠은 화면 위쪽에 있다.** 코칭을 우측 레일에서 읽으면 시선이 카메라를 크게 벗어나
          상대에게 '딴 데 보는' 것으로 보이고, 비전 분석에도 시선 이탈(GAZE_AWAY)로 잡힌다.
          카메라와 가장 가까운 상단에 두면 읽는 동안에도 시선이 렌즈 근처에 머문다.

          상단 배지 줄(p-3, 약 40px) 아래로 내려 겹치지 않게 하고, 폭을 제한해
          상대 얼굴을 가리지 않는다. 카드는 TTL 로 스스로 사라진다(COACH-04). */}
      {coachOverlay && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center px-3">
          <div className="pointer-events-auto w-full max-w-[420px]">{coachOverlay}</div>
        </div>
      )}

      {/* 하단 우: 내 영상 PIP. */}
      <div
        className="absolute bottom-3 right-3 h-[110px] w-[82px] overflow-hidden rounded-lg sm:h-[150px] sm:w-[112px]"
        style={{
          background: 'var(--bt-mist-900)',
          border: '1px solid var(--bt-color-border-glass)',
          boxShadow: 'var(--bt-shadow-lg)',
        }}
      >
        {localVideo && !cameraDisabled ? (
          <VideoTrackView track={localVideo} mirror />
        ) : (
          <div className="grid h-full place-items-center">
            <Icon name="camera-off" size={18} className="text-faint" />
          </div>
        )}
        <span className="bt-micro absolute bottom-1 left-2" style={{ color: 'var(--bt-mist-300)' }}>
          나
        </span>
      </div>
    </div>
  )
}
