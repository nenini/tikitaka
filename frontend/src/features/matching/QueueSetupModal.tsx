import { useEffect, useState } from 'react'
import { Button, Callout, Chip, Cluster, Field, Input, Modal, Select, Stack } from '@/components'
import {
  DEFAULT_SLOT_DAYS,
  DEFAULT_SLOT_END,
  DEFAULT_SLOT_START,
  MAX_AVAILABLE_SLOTS,
  WEEKDAY_LABEL,
  WEEKDAY_ORDER,
  buildSlots,
} from './types'
import type { DayOfWeek, MatchRequestInput } from './types'

/**
 * 큐 등록·조건 변경 입력 모달.
 *
 * ⚠️ 원래는 W-07(가능 시간대 입력) 화면이 담당할 내용이다. 그 화면이 아직 없는데
 *    백엔드 `MatchRequestSaveRequest` 는 `availableSlots` 를 **필수**로 요구하고
 *    (`@NotNull @Size(min=1,max=14)`), PUT 은 부분 수정이 아니라 전체 교체라
 *    조건 완화 때도 슬롯을 다시 보내야 한다. 그래서 큐 등록 흐름 안에 최소 입력만 넣었다.
 *
 * 서버 검증(`MatchRequestService.validateRequest`)과 같은 규칙을 클라이언트에서도 막는다
 *  - 슬롯 1~14개 · 같은 요일 시간 겹침 금지 · start < end
 *  - preferredAgeMin > 0 · preferredAgeMax >= preferredAgeMin
 */

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`
  return { value, label: hour === 24 ? '24:00' : value }
})

export interface QueueSetupModalProps {
  open: boolean
  onClose: () => void
  /** 저장 실행. 실패하면 던져서 모달이 오류를 보여주게 한다 */
  onSubmit: (input: MatchRequestInput) => Promise<void>
  /** 이미 등록된 조건(조건 변경 모드) 또는 설문에서 가져온 초기값 */
  initial?: Partial<MatchRequestInput>
  title?: string
  description?: string
  submitLabel?: string
  /** 서버가 돌려준 오류 메시지 */
  error?: string | null
}

export function QueueSetupModal({
  open,
  onClose,
  onSubmit,
  initial,
  title = '매칭 조건 설정',
  description = '연령 범위와 가능한 시간대를 정하면 조건이 맞는 상대를 찾아드려요.',
  submitLabel = '대기 큐 등록',
  error,
}: QueueSetupModalProps) {
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [days, setDays] = useState<DayOfWeek[]>(DEFAULT_SLOT_DAYS)
  const [startTime, setStartTime] = useState(DEFAULT_SLOT_START)
  const [endTime, setEndTime] = useState(DEFAULT_SLOT_END)
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // 모달이 열릴 때마다 초기값으로 되돌린다(직전 입력이 남아 있으면 혼란스럽다).
  useEffect(() => {
    if (!open) return
    setLocalError(null)
    setAgeMin(initial?.preferredAgeMin != null ? String(initial.preferredAgeMin) : '')
    setAgeMax(initial?.preferredAgeMax != null ? String(initial.preferredAgeMax) : '')

    const slots = initial?.availableSlots ?? []
    if (slots.length > 0) {
      setDays(slots.map((slot) => slot.dayOfWeek))
      setStartTime(slots[0].startTime.slice(0, 5))
      setEndTime(slots[0].endTime.slice(0, 5))
    } else {
      setDays(DEFAULT_SLOT_DAYS)
      setStartTime(DEFAULT_SLOT_START)
      setEndTime(DEFAULT_SLOT_END)
    }
  }, [open, initial])

  const min = Number(ageMin)
  const max = Number(ageMax)
  const ageInvalid = !ageMin || !ageMax || min <= 0 || max < min
  const timeInvalid = startTime >= endTime
  const daysInvalid = days.length === 0 || days.length > MAX_AVAILABLE_SLOTS
  const invalid = ageInvalid || timeInvalid || daysInvalid

  function toggleDay(day: DayOfWeek, next: boolean) {
    setDays((prev) => (next ? [...prev, day] : prev.filter((d) => d !== day)))
  }

  async function save() {
    if (invalid || saving) return
    setSaving(true)
    setLocalError(null)
    try {
      await onSubmit({
        preferredAgeMin: min,
        preferredAgeMax: max,
        availableSlots: buildSlots(days, startTime, endTime),
      })
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : '저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={saving} disabled={invalid} onClick={save}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <Stack gap={16}>
        <p className="bt-body-sm bt-muted">{description}</p>

        {(error || localError) && <Callout tone="danger">{error ?? localError}</Callout>}

        <div>
          <span className="bt-overline">연령 범위</span>
          <div className="mt-2 flex items-end gap-3">
            <Field label="최소">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={19}
                  max={99}
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.currentTarget.value)}
                />
              )}
            </Field>
            <span className="bt-muted pb-2">~</span>
            <Field label="최대">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={19}
                  max={99}
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.currentTarget.value)}
                />
              )}
            </Field>
          </div>
          {ageInvalid && (ageMin || ageMax) && (
            <p className="bt-caption mt-1" style={{ color: 'var(--bt-color-danger)' }}>
              최대 연령이 최소 연령보다 크거나 같아야 해요.
            </p>
          )}
        </div>

        <div>
          <span className="bt-overline">가능한 요일</span>
          <Cluster gap={6} className="mt-2">
            {WEEKDAY_ORDER.map((day) => (
              <Chip
                key={day}
                selected={days.includes(day)}
                onSelectedChange={(next) => toggleDay(day, next)}
              >
                {WEEKDAY_LABEL[day]}
              </Chip>
            ))}
          </Cluster>
          {daysInvalid && (
            <p className="bt-caption mt-1" style={{ color: 'var(--bt-color-danger)' }}>
              요일을 1개 이상 {MAX_AVAILABLE_SLOTS}개 이하로 골라주세요.
            </p>
          )}
        </div>

        <div>
          <span className="bt-overline">가능한 시간대</span>
          <div className="mt-2 flex items-end gap-3">
            <Field label="시작">
              {({ id }) => (
                <Select
                  id={id}
                  options={HOUR_OPTIONS}
                  value={startTime}
                  onChange={(e) => setStartTime(e.currentTarget.value)}
                />
              )}
            </Field>
            <span className="bt-muted pb-2">~</span>
            <Field label="종료">
              {({ id }) => (
                <Select
                  id={id}
                  options={HOUR_OPTIONS}
                  value={endTime}
                  onChange={(e) => setEndTime(e.currentTarget.value)}
                />
              )}
            </Field>
          </div>
          {timeInvalid && (
            <p className="bt-caption mt-1" style={{ color: 'var(--bt-color-danger)' }}>
              종료 시각이 시작 시각보다 늦어야 해요.
            </p>
          )}
          <p className="bt-caption bt-muted mt-2">
            고른 요일에 같은 시간대가 적용돼요. 범위가 넓을수록 매칭이 빨라져요.
          </p>
        </div>
      </Stack>
    </Modal>
  )
}
