import { Badge, Cluster, QuestionCard, TopicButton } from '@/components'
import type { QuestionCardState, QuestionOption } from '@/components'
import type { SilenceStage } from '../useSilenceStage'

export interface SilenceTopic {
  id: string
  label: string
}

export interface SilenceHintProps {
  stage: SilenceStage
  silenceSec: number
  topics: readonly SilenceTopic[]
  questions?: readonly QuestionOption[]
  questionsState?: QuestionCardState
  onPickTopic: (id: string) => void
  onPickQuestion: (id: string) => void
  onRetryQuestions?: () => void
}

/**
 * 침묵 단계별 개입 UI (§11.1). 세션 화면 안에 통합되며 **상대 영상을 가리지 않는다**
 * — 화면 좌하단에만 머무르고 전체를 덮지 않는다.
 *
 * 단계가 올라가도 아래 단계를 함께 쌓지 않는다. 항상 현재 단계 하나만 그린다.
 */
export function SilenceHint({
  stage,
  silenceSec,
  topics,
  questions,
  questionsState,
  onPickTopic,
  onPickQuestion,
  onRetryQuestions,
}: SilenceHintProps) {
  // 0–10초: 침묵을 견디는 것이 이 단계의 구현이다.
  if (stage === 'none') return null

  if (stage === 'topic') {
    return (
      <Cluster gap={8}>
        {topics.map((topic) => (
          <TopicButton key={topic.id} onClick={() => onPickTopic(topic.id)}>
            {topic.label}
          </TopicButton>
        ))}
      </Cluster>
    )
  }

  // 30초+ : 선택형 질문 카드. 45초+(coach)에서는 캡션만 한 칸 더 구체적으로 바뀐다.
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Badge tone="warning">침묵 {silenceSec}초</Badge>
      </div>
      <QuestionCard
        caption={
          stage === 'coach'
            ? '대화 흐름에 맞춘 질문이에요 · 나에게만 보여요'
            : '이런 질문은 어때요? · 나에게만 보여요'
        }
        options={questions}
        state={questionsState}
        onSelect={onPickQuestion}
        onRetry={onRetryQuestions}
      />
    </div>
  )
}
