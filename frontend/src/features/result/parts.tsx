import { useEffect, useState } from 'react'
import { Button, Field, Modal, Rating, Switch, Textarea } from '@/components'
import { blockUser, getReportTypes, reportSessionUser } from './api'
import { FALLBACK_REPORT_TYPES, PEER_REVIEW_TEXT_MAX } from './types'
import type { PeerReviewMetricDef, ReportTypeOption } from './types'

/* ── 정량 평가 한 줄 ────────────────────────────────────── */

export interface MetricRowProps {
  metric: PeerReviewMetricDef
  value?: number
  onChange: (value: number) => void
  disabled?: boolean
  /** 좁은 화면에서는 보조 설명을 접는다(목업 모바일과 동일) */
  compact?: boolean
}

/**
 * 정량 평가 1행 — 항목명 + 기준 한 줄 + 1~5 Rating.
 * Rating 은 네이티브 radio 그룹이라 방향키 탐색이 그대로 동작한다.
 */
export function MetricRow({ metric, value, onChange, disabled, compact }: MetricRowProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 py-2.5"
      style={{ borderBottom: '1px solid var(--bt-color-border)' }}
    >
      <div className="flex min-w-[8rem] flex-col gap-1">
        <b className="bt-body-sm">{metric.label}</b>
        {!compact && <span className="bt-caption bt-muted">{metric.help}</span>}
      </div>
      <Rating
        aria-label={`${metric.label} — ${metric.help}`}
        name={`peer-review-${metric.key}`}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}

/* ── 서술형(선택) ───────────────────────────────────────── */

export interface FreeTextFieldProps {
  label: string
  placeholder: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

/** 서술형은 **선택**이다 — required 를 붙이지 않는다(§W-14 규칙). */
export function FreeTextField({ label, placeholder, value, onChange, disabled }: FreeTextFieldProps) {
  return (
    <Field
      label={
        <>
          {label} <span className="bt-caption bt-muted">(선택)</span>
        </>
      }
      help={`${value.length} / ${PEER_REVIEW_TEXT_MAX}자`}
    >
      <Textarea
        rows={3}
        placeholder={placeholder}
        maxLength={PEER_REVIEW_TEXT_MAX}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/* ── 신고 · 차단 ────────────────────────────────────────── */

export interface ReportBlockDialogProps {
  open: boolean
  onClose: () => void
  sessionId: string
  opponent: { userId: string; nickname: string }
  onDone?: () => void
}

/**
 * 신고·차단 진입(W-14 구성요소).
 *
 * ⚠️ 임의 구현: 전용 신고 화면(W-13)은 이번 배치 밖이라, 평가 화면에서 이탈하지 않도록
 *    최소 형태(사유 선택 + 상세 + 차단 동시 처리)의 모달로 만들었다.
 *    W-13 이 구현되면 이 모달을 그 화면으로의 이동으로 바꾸면 된다.
 */
export function ReportBlockDialog({
  open,
  onClose,
  sessionId,
  opponent,
  onDone,
}: ReportBlockDialogProps) {
  const [types, setTypes] = useState<ReportTypeOption[]>([...FALLBACK_REPORT_TYPES])
  const [typeCode, setTypeCode] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    getReportTypes().then((list) => alive && setTypes(list))
    return () => {
      alive = false
    }
  }, [open])

  async function submit() {
    if (!typeCode || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await reportSessionUser(sessionId, { reportTypeCode: typeCode, detail: detail.trim() || undefined })
      if (alsoBlock) await blockUser(opponent.userId)
      onDone?.()
      onClose()
    } catch {
      setError('접수에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="신고 · 차단"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button
            variant="danger"
            leadingIcon="report"
            onClick={submit}
            loading={submitting}
            disabled={!typeCode}
          >
            접수하기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="bt-body-sm bt-muted">
          접수 내용은 상대에게 알려지지 않아요. 확인까지 시간이 걸릴 수 있고, 심각한 사안은 먼저 조치됩니다.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="bt-label mb-1">어떤 점이 문제였나요?</legend>
          {types.map((t) => (
            <label key={t.code} className="bt-body-sm flex items-center gap-2.5">
              <input
                type="radio"
                name="report-type"
                value={t.code}
                checked={typeCode === t.code}
                onChange={() => setTypeCode(t.code)}
              />
              {t.label}
            </label>
          ))}
        </fieldset>

        <Field label="상세 설명" help="선택 입력이에요.">
          <Textarea
            rows={3}
            maxLength={PEER_REVIEW_TEXT_MAX}
            placeholder="언제, 어떤 상황이었는지 적어주시면 확인이 빨라져요."
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </Field>

        <div className="flex items-center justify-between gap-3">
          <span className="bt-body-sm">
            {opponent.nickname}님 차단하기
            <span className="bt-caption bt-muted block">차단하면 다시 매칭되지 않아요.</span>
          </span>
          <Switch
            checked={alsoBlock}
            onChange={(e) => setAlsoBlock(e.target.checked)}
            aria-label={`${opponent.nickname}님 차단하기`}
          />
        </div>

        {error && (
          <span className="bt-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </Modal>
  )
}
