import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export interface QuestionOption {
  id: string
  text: ReactNode
}

export interface QuestionCardProps {
  /** 상단 캡션 (기본: "이런 질문은 어때요? · 나에게만 보여요") */
  caption?: ReactNode
  options: QuestionOption[]
  onSelect: (id: string) => void
  className?: string
}

/**
 * 침묵 30초+ 단계의 선택형 질문 카드 (`.bt-question-card`, §11.1).
 * 본인 화면 전용 — 여전히 상대 영상을 가리지 않는다.
 */
export function QuestionCard({ caption, options, onSelect, className }: QuestionCardProps) {
  return (
    <div className={cn('bt-question-card', className)} role="group">
      <div className="bt-caption" style={{ color: 'var(--bt-color-text-tertiary)' }}>
        {caption ?? '이런 질문은 어때요? · 나에게만 보여요'}
      </div>
      {options.map((opt) => (
        <button key={opt.id} type="button" className="bt-question-card__option" onClick={() => onSelect(opt.id)}>
          {opt.text}
        </button>
      ))}
    </div>
  )
}
