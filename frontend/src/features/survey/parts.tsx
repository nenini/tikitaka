import { Chip, Cluster, Select, Stack } from '@/components'
import { AGE_MAX, AGE_MIN } from './types'

/* ── 단일 선택 칩 그룹 ──────────────────────────────────── */

export interface SingleChoiceProps<T extends { id: number; name: string }> {
  options: readonly T[]
  value: number | null
  onChange: (id: number) => void
  disabled?: boolean
  /** 라디오 그룹으로 읽히도록 그룹 이름을 준다 */
  label: string
}

/**
 * 하나만 고르는 칩 그룹(선호 얼굴상).
 *
 * 이미 고른 칩을 다시 눌러도 **해제되지 않는다** — 서버가 `@NotNull` 이라
 * 빈 상태로 되돌릴 수 있으면 제출 직전에 다시 막아야 한다.
 */
export function SingleChoice<T extends { id: number; name: string }>({
  options,
  value,
  onChange,
  disabled,
  label,
}: SingleChoiceProps<T>) {
  return (
    <Cluster gap={8} role="group" aria-label={label}>
      {options.map((option) => (
        <Chip
          key={option.id}
          selected={value === option.id}
          disabled={disabled}
          onSelectedChange={() => onChange(option.id)}
        >
          {option.name}
        </Chip>
      ))}
    </Cluster>
  )
}

/* ── 개수 제한 다중 선택 칩 그룹 ────────────────────────── */

export interface MultiChoiceProps<T extends { id: number; name: string }> {
  options: readonly T[]
  value: readonly number[]
  onChange: (next: number[]) => void
  /** 정확히 이 개수만 고를 수 있다. 없으면 상한 없음 */
  exactly?: number
  disabled?: boolean
  label: string
}

/**
 * 여러 개를 고르는 칩 그룹(성격 3개 · 개선 고민 1개 이상).
 *
 * `exactly` 를 채우면 **고르지 않은 칩을 비활성**한다. 눌러도 아무 일이 없으면
 * 고장으로 보이므로, 더 고를 수 없다는 사실이 눌러보기 전에 드러나야 한다.
 */
export function MultiChoice<T extends { id: number; name: string }>({
  options,
  value,
  onChange,
  exactly,
  disabled,
  label,
}: MultiChoiceProps<T>) {
  const full = exactly != null && value.length >= exactly

  return (
    <Cluster gap={8} role="group" aria-label={label}>
      {options.map((option) => {
        const selected = value.includes(option.id)
        return (
          <Chip
            key={option.id}
            selected={selected}
            disabled={disabled || (full && !selected)}
            onSelectedChange={(next) =>
              onChange(next ? [...value, option.id] : value.filter((id) => id !== option.id))
            }
          >
            {option.name}
          </Chip>
        )
      })}
    </Cluster>
  )
}

/* ── 선호 나이 범위 ─────────────────────────────────────── */

const AGE_OPTIONS = Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => {
  const age = AGE_MIN + i
  return { value: String(age), label: `${age}세` }
})

export interface AgeRangeFieldProps {
  min: number
  max: number
  onChange: (next: { min: number; max: number }) => void
  disabled?: boolean
}

/**
 * 선호 나이 범위.
 *
 * 한쪽을 움직여 역전되면 **반대쪽을 같이 끌고 간다.** 서버가 `max >= min` 을
 * 검증하므로 애초에 역전 상태를 만들 수 없게 하는 편이 오류 문구보다 낫다.
 */
export function AgeRangeField({ min, max, onChange, disabled }: AgeRangeFieldProps) {
  return (
    <Stack gap={8}>
      <div className="flex items-center gap-2">
        <Select
          aria-label="최소 선호 나이"
          options={AGE_OPTIONS}
          value={String(min)}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value)
            onChange({ min: next, max: Math.max(next, max) })
          }}
        />
        <span className="bt-body-sm bt-muted shrink-0">~</span>
        <Select
          aria-label="최대 선호 나이"
          options={AGE_OPTIONS}
          value={String(max)}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value)
            onChange({ min: Math.min(min, next), max: next })
          }}
        />
      </div>
      <span className="bt-caption bt-muted">
        매칭 상대의 나이 범위예요. 범위가 좁을수록 매칭까지 오래 걸릴 수 있어요.
      </span>
    </Stack>
  )
}
