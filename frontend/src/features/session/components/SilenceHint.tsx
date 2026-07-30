import type { CSSProperties } from 'react'
import { Badge, Cluster, Icon, QuestionCard } from '@/components'
import type { QuestionCardState, QuestionOption } from '@/components'
import type { SilenceStage } from '../useSilenceStage'
import { useIsCompactViewport } from '@/shared/lib/useIsCompactViewport'


function HintCloseButton({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  return (
    <button
      type="button"
      className="bt-icon-btn"
      aria-label="힌트 닫기"
      onClick={onClick}
      style={{ width: 28, height: 28, flex: 'none', background: 'transparent', boxShadow: 'none', ...style }}
    >
      <Icon name="close" size={14} />
    </button>
  )
}

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
  onRetryQuestions?: () => void
  /** 힌트를 직접 닫는다. 침묵 계측을 리셋해 다음 침묵 사이클까지 다시 뜨지 않는다. */
  onDismiss: () => void
}


export function SilenceHint({
  stage,
  silenceSec,
  topics,
  questions,
  questionsState,
  onRetryQuestions,
  onDismiss,
}: SilenceHintProps) {
  // 가로 캐러셀
  const compact = useIsCompactViewport()

  // 0–10초: 침묵을 견디는 것이 이 단계의 구현이다.
  if (stage === 'none') return null

  if (stage === 'topic') {
    return (
      <div className="flex items-start gap-2">
        <Cluster gap={8}>
          {topics.map((topic) => (
            <span key={topic.id} className="bt-topic-btn" style={{ cursor: 'default' }}>
              {topic.label}
            </span>
          ))}
        </Cluster>
        <HintCloseButton onClick={onDismiss} />
      </div>
    )
  }

  // 30초+ : 선택형 질문 카드. 45초+(coach)에서는 캡션만 한 칸 더 구체적으로 바뀐다.
  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <div>
          <Badge tone="warning">침묵 {silenceSec}초</Badge>
        </div>
      )}
      {/* 닫기 버튼을 카드 안쪽 우상단에 얹기 위한 기준점 */}
      <div className="relative">
        <QuestionCard
          orientation={compact ? 'row' : 'column'}
          caption={
            compact
              ? `침묵 ${silenceSec}초 · 나에게만 보여요`
              : stage === 'coach'
                ? '대화 흐름에 맞춘 질문이에요 · 나에게만 보여요'
                : '이런 질문은 어때요? · 나에게만 보여요'
          }
          options={questions}
          state={questionsState}
          disabled
          onSelect={() => { }}
          onRetry={onRetryQuestions}
          className="[&_button:disa bled]:cursor-default!"
        />

        {/* <button onClick={onDismiss} aria-label="힌트 닫기" style={{ position: 'absolute', top: 8, right: 14 }}>X</button> */}
        {/* <HintCloseButton onClick={onDismiss} aria-label="힌트 닫기" style={{ position: 'absolute', top: 8, right: 14 }} /> */}
      </div>
    </div>
  )
}
