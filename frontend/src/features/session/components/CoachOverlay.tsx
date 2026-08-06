import { CoachToast } from '@/components'
import type { CoachMessage } from '@/stores/coaching.store'

const TONE_TITLE: Record<CoachMessage['tone'], string> = {
  positive: '잘 되고 있어요',
  negative: '이렇게 해볼까요',
  neutral: '참고해 주세요',
}

export interface CoachOverlayProps {
  /**
   * 현재 띄울 코칭 메시지. **한 번에 하나만** 받는다(원칙 2) —
   * 배열을 받아 쌓으면 규칙이 화면에서 조용히 깨진다.
   * 어느 것을 띄울지는 부모가 우선순위·도착순으로 고른다.
   */
  message: CoachMessage | null
  onDismiss: () => void
}

/**
 * 영상 위(카메라 근처)에 뜨는 코칭 카드.
 *
 * 레일이 아니라 상단 중앙에 두는 이유는 **시선**이다. 웹캠은 화면 위쪽에 있어서,
 * 우측 레일을 읽으면 시선이 렌즈를 크게 벗어난다 — 상대에게는 딴 데 보는 것으로 보이고
 * 비전 분석에도 시선 이탈로 잡힌다. 배치는 `SessionStage` 의 `coachOverlay` 슬롯이 정한다.
 */
export function CoachOverlay({ message, onDismiss }: CoachOverlayProps) {
  if (!message) return null
  return (
    <CoachToast
      messageId={message.id}
      title={TONE_TITLE[message.tone]}
      text={message.text}
      // 표정·반응 추정 기반 코칭에는 헤지 표기가 필수다(원칙 3).
      hedge={message.tone !== 'neutral'}
      // 서버가 정한 유효 시간이 지나면 스스로 사라진다(COACH-04).
      // 사용자가 직접 닫는 길도 그대로 열어 둔다.
      autoDismissMs={message.ttlMs}
      urgent={message.priority === 'HIGH'}
      onDismiss={onDismiss}
    />
  )
}
