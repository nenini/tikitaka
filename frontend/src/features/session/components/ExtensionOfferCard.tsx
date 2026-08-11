import { Button, Card, Icon } from '@/components'

/** 내 응답 상태. 상대의 응답은 **어떤 값으로도 표현하지 않는다**(아래 주석 참고). */
export type ExtensionChoice = 'pending' | 'accepted' | 'declined'

export interface ExtensionOfferCardProps {
  choice: ExtensionChoice
  onAccept: () => void
  onDecline: () => void
  /** 연장 시간(분). 기본 5 */
  minutes?: number
  /** 제출 실패 사유. 낙관적 갱신을 되돌린 뒤 여기에 적는다 */
  error?: string | null
}

/**
 * 5분 연장 제안 (W-15 · CONTACT-01). 종료 1분 전부터 **세션 화면 코치 영역**에 뜬다
 * — 종료 후 별도 화면이 아니다.
 *
 * 🔒 규칙: **상대의 거절 여부를 표시하지 않는다.** 그래서 "상대가 거절했어요" 같은 상태가
 * 이 컴포넌트에 존재하지 않는다. 내가 수락했는데 연장이 안 되면 그냥 세션이 끝날 뿐이고,
 * 사용자는 상대가 거절했는지 시간이 다 됐는지 구분할 수 없다. 이게 의도된 동작이다.
 *
 * 등장 강조: 답할 시간이 1분뿐이라 조용히 나타나면 놓친다. 카드가 한 번 미끄러져 들어오고
 * 테두리가 두 번만 깜빡인 뒤 멈춘다 — 계속 깜빡이면 대화보다 UI를 보게 된다.
 * `aria-live="assertive"` 는 남용하면 안 되지만, 시한부 요청이라 여기서는 맞는 선택이다.
 */
export function ExtensionOfferCard({
  choice,
  onAccept,
  onDecline,
  minutes = 5,
  error,
}: ExtensionOfferCardProps) {
  return (
    <Card
      variant="inset"
      className="bt-extension-offer"
      role="status"
      aria-live={choice === 'pending' ? 'assertive' : 'polite'}
    >
      <div className="bt-caption mb-1 flex items-center gap-1">
        <Icon name="clock" size={13} />곧 세션이 끝나요
      </div>

      {choice === 'pending' ? (
        <>
          <p className="bt-body-sm mb-3">
            <b>{minutes}분 더</b> 연습할까요? 두 분 모두 수락하면 연장돼요.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" block onClick={onAccept}>
              {minutes}분 연장
            </Button>
            <Button variant="ghost" size="sm" block onClick={onDecline}>
              괜찮아요
            </Button>
          </div>
        </>
      ) : choice === 'accepted' ? (
        // 상대 응답을 기다리는 중. 결과가 어떻든 이 문구 이상은 알려주지 않는다.
        <p className="bt-body-sm bt-muted">연장을 신청했어요. 잠시만 기다려 주세요.</p>
      ) : (
        <p className="bt-body-sm bt-muted">이번 세션은 여기서 마무리할게요.</p>
      )}

      {error && (
        <p className="bt-error mt-2" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}
