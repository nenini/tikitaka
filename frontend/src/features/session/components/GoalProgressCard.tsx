import { Badge, Card, Progress } from '@/components'

export interface GoalProgressCardProps {
  /** 온보딩에서 고른 개선 목표 문구 (예: "발화량 줄이기") */
  goalLabel: string
  /** 내 발화 비율 0~100 */
  speakingRatio: number
  /** 균형으로 보는 범위. 이 밖이면 주의 배지 */
  balancedRange?: readonly [number, number]
}

/**
 * 세션 목표 진행도 (내 발화량). 온보딩의 '개선 목표' 기준으로 표시한다.
 *
 * ⚠️ 원칙 1(연습이지 심사가 아니다): 이건 **대화 행동 지표**지 점수가 아니다.
 * 등수·평가 문구를 붙이지 않고, 숫자 옆에는 항상 "무엇을 해볼지"가 함께 나온다.
 */
export function GoalProgressCard({
  goalLabel,
  speakingRatio,
  balancedRange = [40, 60],
}: GoalProgressCardProps) {
  const [low, high] = balancedRange
  const balanced = speakingRatio >= low && speakingRatio <= high
  const ratio = Math.round(speakingRatio)

  return (
    <Card variant="inset">
      <div className="bt-caption mb-2">개선 목표 · {goalLabel}</div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="bt-body-sm">
          {balanced ? '지금 균형에 가까워요' : ratio > high ? '내가 조금 더 말하고 있어요' : '조금 더 말해도 좋아요'}
        </span>
        <Badge tone={balanced ? 'success' : 'warning'}>
          <span className="bt-numeric">{ratio}%</span>
        </Badge>
      </div>

      <Progress value={ratio} aria-label={`내 발화 비율 ${ratio}퍼센트`} />
    </Card>
  )
}
