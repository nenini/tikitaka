import { CoachToast, Icon } from '@/components'
import type { CoachMessage } from '@/stores/coaching.store'
import { ExtensionOfferCard } from './ExtensionOfferCard'
import type { ExtensionChoice } from './ExtensionOfferCard'
import { GoalProgressCard } from './GoalProgressCard'

export interface CoachRailProps {
  /**
   * 현재 띄울 코칭 메시지. **한 번에 하나만** 받는다(원칙 2) —
   * 배열을 받아 쌓으면 규칙이 화면에서 조용히 깨진다.
   */
  message: CoachMessage | null
  onDismissMessage: () => void
  goalLabel: string
  speakingRatio: number
  /** 종료 1분 전부터 true */
  extensionVisible: boolean
  extensionChoice: ExtensionChoice
  onAcceptExtension: () => void
  onDeclineExtension: () => void
}

const TONE_TITLE: Record<CoachMessage['tone'], string> = {
  positive: '잘 되고 있어요',
  negative: '이렇게 해볼까요',
  neutral: '참고해 주세요',
}

/**
 * 코치 영역 (§10). 데스크탑은 오른쪽 레일, 모바일은 영상 아래 스트립으로 배치된다
 * — 배치는 부모가 정하고 여기서는 내용만 그린다.
 *
 * 🔒 이 영역 전체가 **본인 화면 전용**이다. 상대 소켓으로 전송되지 않으며,
 * 사용자가 그 사실을 알 수 있도록 상단에 항상 "나에게만 보여요"를 명시한다.
 */
export function CoachRail({
  message,
  onDismissMessage,
  goalLabel,
  speakingRatio,
  extensionVisible,
  extensionChoice,
  onAcceptExtension,
  onDeclineExtension,
}: CoachRailProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bt-caption flex items-center gap-1">
        <Icon name="lock" size={12} />
        코치 · 나에게만 보여요
      </div>

      {message && (
        <CoachToast
          messageId={message.id}
          title={TONE_TITLE[message.tone]}
          text={message.text}
          // 표정·반응 추정 기반 코칭에는 헤지 표기가 필수다(원칙 3).
          hedge={message.tone !== 'neutral'}
          onDismiss={onDismissMessage}
        />
      )}

      <GoalProgressCard goalLabel={goalLabel} speakingRatio={speakingRatio} />

      {extensionVisible && (
        <ExtensionOfferCard
          choice={extensionChoice}
          onAccept={onAcceptExtension}
          onDecline={onDeclineExtension}
        />
      )}
    </div>
  )
}
