import type { ReactNode } from 'react'
import { CallBar, IconButton } from '../ui/IconButton'

export interface CallControlsProps {
  /** 마이크가 꺼져 있는가. 버튼의 aria-pressed 와 의미가 일치한다 */
  muted: boolean
  /** 카메라가 꺼져 있는가 */
  cameraDisabled: boolean
  onToggleMute: () => void
  onToggleCamera: () => void
  onEnd: () => void
  /** 비동기 장치 전환 중 — 개별 버튼을 잠그고 스피너를 보여준다 */
  mutePending?: boolean
  cameraPending?: boolean
  endPending?: boolean
  /** 종료 버튼 **왼쪽**에 추가할 컨트롤 (채팅 등) */
  beforeEnd?: ReactNode
  /** 종료 버튼 **오른쪽**에 추가할 컨트롤 (도움 요청 등) */
  afterEnd?: ReactNode
  className?: string
}

/**
 * 세션 하단 통화 컨트롤 바 (`.bt-call-bar` + `.bt-icon-btn`).
 *
 * 규칙 인코딩:
 *  - 마이크/카메라 끔 = 중립 회색(off). 되돌릴 수 있는 상태에 빨강을 쓰지 않는다.
 *  - 종료 = 빨강 원형(end). 아이콘만 허용되는 유일한 예외(학습된 관습).
 *  - 종료 버튼만 56px 대형으로 강조하고, 좌우(beforeEnd/afterEnd)에 보조 컨트롤을 배치한다.
 *
 * 상태 이름은 화면 문구가 아니라 **실제 상태**를 가리킨다(muted / cameraDisabled).
 * 그래서 `aria-pressed={muted}` 가 "음소거 버튼이 눌린 상태"와 그대로 일치한다.
 */
export function CallControls({
  muted,
  cameraDisabled,
  onToggleMute,
  onToggleCamera,
  onEnd,
  mutePending = false,
  cameraPending = false,
  endPending = false,
  beforeEnd,
  afterEnd,
  className,
}: CallControlsProps) {
  return (
    <CallBar className={className}>
      <IconButton
        icon={muted ? 'mic-off' : 'mic'}
        state={muted ? 'off' : 'default'}
        aria-pressed={muted}
        aria-label={muted ? '음소거 해제' : '음소거'}
        loading={mutePending}
        onClick={onToggleMute}
      />
      <IconButton
        icon={cameraDisabled ? 'camera-off' : 'camera'}
        state={cameraDisabled ? 'off' : 'default'}
        aria-pressed={cameraDisabled}
        aria-label={cameraDisabled ? '카메라 켜기' : '카메라 끄기'}
        loading={cameraPending}
        onClick={onToggleCamera}
      />
      {beforeEnd}
      <IconButton
        icon="phone-end"
        state="end"
        large
        aria-label="세션 종료"
        loading={endPending}
        onClick={onEnd}
      />
      {afterEnd}
    </CallBar>
  )
}
