import type { ReactNode } from 'react'
import { CoachToast, Icon } from '@/components'
import type { CoachMessage } from '@/stores/coaching.store'
import { ExtensionOfferCard } from './ExtensionOfferCard'
import type { ExtensionChoice } from './ExtensionOfferCard'
import { GoalProgressCard } from './GoalProgressCard'
import { MissionProgressCard } from './MissionProgressCard'
import type { SessionMission } from '../types'

export interface CoachRailProps {
  /**
   * 침묵 단계 힌트(주제·질문). 코칭과 같은 "나에게만 보이는" 영역이라 여기 모은다 —
   * 영상 위에 얹으면 상대 얼굴을 가리기 때문이다(원칙 2).
   * 나타났다 사라지는 시간 민감 정보라 레일 **맨 위**에 둔다.
   */
  silenceHint?: ReactNode
  /**
   * 현재 띄울 코칭 메시지. **한 번에 하나만** 받는다(원칙 2) —
   * 배열을 받아 쌓으면 규칙이 화면에서 조용히 깨진다.
   * 어느 것을 띄울지는 부모가 우선순위·도착순으로 고른다.
   */
  message: CoachMessage | null
  /**
   * 뒤에서 대기 중인 코칭 수.
   * 표시하지 않으면 사용자는 코칭이 하나뿐이라고 믿고 닫아버린다.
   */
  pendingMessageCount?: number
  onDismissMessage: () => void
  /** 안전 경고 카드. 코칭보다 위에 놓는다 — 성격이 다르고 더 급하다 */
  safetyWarning?: ReactNode
  goalLabel: string
  /**
   * 내 발화 비율 0~100.
   * ⚠️ 백엔드에 실시간 발화 비율을 내려주는 경로가 없다(분석 이벤트는 AI→BE 단방향).
   *    값이 없으면 카드를 그리지 않는다 — 가짜 숫자를 세우지 않기 위해서다.
   */
  speakingRatio?: number | null
  /** 서버가 배정한 세션 미션. 없으면 카드를 그리지 않는다 */
  missions?: SessionMission[]
  /** 종료 5분 전(서버 제출 창)부터 true */
  extensionVisible: boolean
  extensionChoice: ExtensionChoice
  /** 제출 실패 사유 */
  extensionError?: string | null
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
  silenceHint,
  message,
  pendingMessageCount = 0,
  onDismissMessage,
  safetyWarning,
  goalLabel,
  speakingRatio,
  missions = [],
  extensionVisible,
  extensionChoice,
  extensionError,
  onAcceptExtension,
  onDeclineExtension,
}: CoachRailProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bt-caption flex items-center gap-1">
        <Icon name="lock" size={12} />
        코치 · 나에게만 보여요
      </div>

      {/* 연장 제안은 시한부 요청이라 레일 **맨 위에 고정**한다.
          아래에 두면 레일이 스크롤될 때 화면 밖으로 밀려 응답 기회 자체가 사라진다. */}
      {extensionVisible && (
        <div className="bt-rail-sticky">
          <ExtensionOfferCard
            choice={extensionChoice}
            error={extensionError}
            onAccept={onAcceptExtension}
            onDecline={onDeclineExtension}
          />
        </div>
      )}

      {/* 안전 경고는 코칭 제안과 성격이 다르다 — 먼저, 그리고 따로 보여준다 */}
      {safetyWarning}

      {silenceHint}

      {message && (
        <div className="flex flex-col gap-1">
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
            onDismiss={onDismissMessage}
          />
          {pendingMessageCount > 0 && (
            <span className="bt-caption bt-muted" role="status" aria-live="polite">
              코칭 <span className="bt-numeric">{pendingMessageCount}</span>건이 더 기다리고 있어요
            </span>
          )}
        </div>
      )}

      {/* 발화 비율 지표는 서버 경로가 생길 때만 그린다(가짜 숫자 금지) */}
      {typeof speakingRatio === 'number' && (
        <GoalProgressCard goalLabel={goalLabel} speakingRatio={speakingRatio} />
      )}

      <MissionProgressCard missions={missions} />
    </div>
  )
}
