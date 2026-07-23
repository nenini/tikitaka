import type { ReactNode } from 'react'
import { CallBar, IconButton } from '@/components/ui/IconButton'

export interface CallControlsProps {
  micOn: boolean
  camOn: boolean
  onToggleMic: () => void
  onToggleCam: () => void
  onEnd: () => void
  /** 마이크·카메라·종료 사이/주변에 추가할 버튼 (채팅·도움 요청 등) */
  extra?: ReactNode
  className?: string
}

/**
 * 세션 하단 통화 컨트롤 바 (`.bt-call-bar` + `.bt-icon-btn`).
 * 규칙 인코딩:
 *  - 마이크/카메라 끔 = 중립 회색(off). 되돌릴 수 있는 상태에 빨강을 쓰지 않는다.
 *  - 종료 = 빨강 원형(end). 아이콘만 허용되는 유일한 예외(학습된 관습).
 *  - 종료 버튼만 56px 대형으로 강조.
 */
export function CallControls({ micOn, camOn, onToggleMic, onToggleCam, onEnd, extra, className }: CallControlsProps) {
  return (
    <CallBar className={className}>
      <IconButton
        icon={micOn ? 'mic' : 'mic-off'}
        state={micOn ? 'default' : 'off'}
        aria-pressed={!micOn}
        aria-label={micOn ? '마이크 끄기' : '마이크 켜기'}
        onClick={onToggleMic}
      />
      <IconButton
        icon={camOn ? 'camera' : 'camera-off'}
        state={camOn ? 'default' : 'off'}
        aria-pressed={!camOn}
        aria-label={camOn ? '카메라 끄기' : '카메라 켜기'}
        onClick={onToggleCam}
      />
      <IconButton icon="phone-end" state="end" large aria-label="세션 종료" onClick={onEnd} />
      {extra}
    </CallBar>
  )
}
