import type { CSSProperties } from 'react'
import { Badge, Cluster, Icon, QuestionCard } from '@/components'
import type { QuestionCardState, QuestionOption } from '@/components'
import type { SilenceStage } from '../useSilenceStage'
import { useIsCompactViewport } from '../useIsCompactViewport'

/**
 * 힌트 닫기 버튼. 기본 IconButton(44px)은 127px짜리 질문 카드에 얹기엔 너무 커서
 * 디자인 시스템이 코치 토스트에 쓰는 `.bt-coach__close`(28px 투명)와 같은 치수를 따른다.
 * `.bt-icon-btn` 을 그대로 얹어 포커스 링만 공유하고 크기·배경만 덮어쓴다.
 *
 * ⚠️ 28px 는 최소 터치 타깃 44px 미만이다. 코치 토스트가 이미 같은 절충을 하고 있어
 * 일관성을 택했지만, 모바일에서 이 버튼이 유일한 액션이라는 점은 감안해야 한다.
 */
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

/**
 * 침묵 단계별 개입 UI (§11.1). 세션 화면 안에 통합되며 **상대 영상을 가리지 않는다**
 * — 화면 좌하단에만 머무르고 전체를 덮지 않는다.
 *
 * ⚠️ 주제·질문 항목은 눌러도 실제로 연결되는 동작이 없다(대화에 삽입되거나 전송되지 않는다).
 * 버튼처럼 보이는데 눌러도 반응이 없으면 고장으로 오해하기 쉬우므로, 항목은 정보 표시용으로
 * 고정하고(클릭 불가) **닫기(X)만 실제로 동작**한다. 실행되는 액션(재시도)이 있는 요소는
 * 그대로 클릭 가능하게 둔다.
 *
 * 단계가 올라가도 아래 단계를 함께 쌓지 않는다. 항상 현재 단계 하나만 그린다.
 */
export function SilenceHint({
  stage,
  silenceSec,
  topics,
  questions,
  questionsState,
  onRetryQuestions,
  onDismiss,
}: SilenceHintProps) {
  // 좁은 화면에서 세로 스택 카드는 212px(스테이지의 45%)까지 자라 상대 얼굴을 덮는다.
  // 원칙 2(코칭은 상대 영상을 가리지 않는다)를 지키려면 가로 캐러셀로 눕혀야 한다.
  const compact = useIsCompactViewport()

  // 0–10초: 침묵을 견디는 것이 이 단계의 구현이다.
  if (stage === 'none') return null

  if (stage === 'topic') {
    return (
      <div className="flex items-start gap-2">
        <Cluster gap={8}>
          {topics.map((topic) => (
            // TopicButton(공용 컴포넌트)은 <button> 엘리먼트를 강제한다.
            // 실제 클릭 동작이 없는데 button 시맨틱을 쓰면 스크린리더도 "누를 수 있다"고
            // 안내하므로, 같은 시각 스타일(.bt-topic-btn)만 가져와 비상호작용 span 으로 둔다.
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
      {/* 침묵 경과 배지는 40px(힌트 블록의 24%)를 먹는다. 좁은 화면에서는 그만큼
          세로를 더 쓰므로 접고, 같은 정보를 캡션에 실어 보낸다. */}
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
          // 옵션 선택 자체가 아무 동작도 하지 않으므로 비활성화한다. onSelect 는 QuestionCard 의
          // 필수 prop이라 no-op 을 넘긴다 — disabled 상태에서는 어차피 호출되지 않는다.
          disabled
          onSelect={() => { }}
          onRetry={onRetryQuestions}
        />

        {/* <button onClick={onDismiss} aria-label="힌트 닫기" style={{ position: 'absolute', top: 8, right: 14 }}>X</button> */}
        <HintCloseButton onClick={onDismiss} aria-label="힌트 닫기" style={{ position: 'absolute', top: 8, right: 14 }} />
      </div>
    </div>
  )
}
