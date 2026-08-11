import { useId, useRef, useState, useEffect } from 'react'
import { Button, Field, Icon, IconButton, Modal, Rating, Switch, Textarea } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { blockUser, reportSessionUser } from './api'
import { EVALUATION_ITEM_HELP, EVALUATION_TEXT_MAX, MODERATION_DETAIL_MAX, MODERATION_REASONS } from './types'
import type { EvaluationItemDef, ModerationReasonCode } from './types'

/* ── 정량 평가 한 줄 ────────────────────────────────────── */

export interface MetricRowProps {
  metric: EvaluationItemDef
  value?: number
  onChange: (value: number) => void
  disabled?: boolean
  /** 좁은 화면에서는 보조 설명을 접는다(목업 모바일과 동일) */
  compact?: boolean
  /** 목록의 마지막 행 — 구분선을 그리지 않는다 */
  last?: boolean
}

/**
 * 정량 평가 1행 — 항목명 + 기준 한 줄 + Rating.
 * Rating 은 네이티브 radio 그룹이라 방향키 탐색이 그대로 동작한다.
 *
 * 척도 범위는 서버(`minScore`~`maxScore`)를 따른다. 보조 문구는 서버가 주지 않아
 * `EVALUATION_ITEM_HELP` 에서 찾고, 모르는 key 면 label 만 그린다.
 */
export function MetricRow({ metric, value, onChange, disabled, compact, last }: MetricRowProps) {
  const help = EVALUATION_ITEM_HELP[metric.key]
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 py-3"
      // 마지막 행에는 구분선을 두지 않는다 — 카드 바닥에 뜬 선이 남는다
      style={last ? undefined : { borderBottom: '1px solid var(--bt-color-border)' }}
    >
      <div className="flex min-w-[8rem] flex-col gap-1">
        <b className="bt-body-sm">{metric.label}</b>
        {!compact && help && <span className="bt-caption bt-muted">{help}</span>}
      </div>
      <Rating
        aria-label={help ? `${metric.label} — ${help}` : metric.label}
        name={`peer-evaluation-${metric.key}`}
        max={metric.maxScore}
        value={value}
        onChange={onChange}
        disabled={disabled}
        // 숫자만 두면 1이 좋은 쪽인지 나쁜 쪽인지 알 수 없다
        anchors={RATING_ANCHORS}
      />
    </div>
  )
}

/** 1~5 척도의 양 끝. 항목이 달라도 방향은 같아야 해서 한 곳에 둔다. */
const RATING_ANCHORS = ['아쉬웠어요', '아주 좋았어요'] as const satisfies readonly [string, string]

/* ── 받은 평가 한 줄(읽기 전용) ─────────────────────────── */

export interface ScoreReadoutProps {
  label: string
  score: number
  max?: number
  /** 목록의 마지막 행 — 구분선을 그리지 않는다 */
  last?: boolean
}

/**
 * 받은 점수 1행 — 항목명 + 하트 + 숫자.
 *
 * `Rating` 을 쓰지 않는다. 그쪽은 radio 라 화면에 두면 **눌러서 바꿀 수 있게** 보인다 —
 * 받은 평가는 고칠 수 없는 값이다. 그래서 입력 기능이 없는 표시용을 따로 둔다.
 *
 * 하트만 두지 않고 숫자를 함께 적는다. 하트 5개를 눈으로 세는 것보다 빠르고,
 * 확대·고대비 환경에서 모양이 뭉개져도 값이 남는다.
 */
export function ScoreReadout({ label, score, max = 5, last }: ScoreReadoutProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2"
      style={last ? undefined : { borderBottom: '1px solid var(--bt-color-border)' }}
    >
      <span className="bt-body-sm">{label}</span>
      <div className="flex flex-none items-center gap-2">
        <span className="flex" aria-hidden>
          {Array.from({ length: max }, (_, i) => (
            <Icon
              key={i}
              name={i < score ? 'heart-fill' : 'heart'}
              size={17}
              style={{ color: i < score ? 'var(--bt-rose-500)' : 'var(--bt-color-border-strong)' }}
            />
          ))}
        </span>
        {/* 스크린리더에는 하트가 아니라 이 값이 읽힌다 */}
        <span className="bt-caption bt-muted bt-numeric w-4 text-right">
          <span className="bt-sr-only">{max}점 중 </span>
          {score}
        </span>
      </div>
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
  /** 서버가 준 상한(`EvaluationItems.maxTextLength`). 응답 전에는 상수로 폴백한다. */
  maxLength?: number
}

/** 서술형은 **선택**이다 — required 를 붙이지 않는다(§W-14 규칙). */
export function FreeTextField({
  label,
  placeholder,
  value,
  onChange,
  disabled,
  maxLength = EVALUATION_TEXT_MAX,
}: FreeTextFieldProps) {
  return (
    <Field
      label={
        <>
          {label}
          {/* <span className="bt-caption bt-muted">(선택)</span> */}
        </>
      }
      help={`${value.length} / ${maxLength}자`}
    >
      <Textarea
        rows={3}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/* ── 헤더 오버플로 메뉴 ─────────────────────────────────── */

export interface OverflowMenuItem {
  label: string
  onSelect: () => void
  /** 파괴적 액션 — 위험색으로 그린다 */
  danger?: boolean
}

/**
 * 헤더의 '더보기' 메뉴.
 *
 * 신고·차단처럼 **되돌리기 어려운 액션은 주 CTA 옆에 두지 않는다.** '평가 제출' 바로 옆에
 * 붙어 있으면 오클릭이 곧 신고 접수로 이어지고, 시각적으로도 두 액션의 무게가 같아 보인다.
 * 여기로 옮겨 한 단계 뒤에 둔다.
 *
 * 포커스는 네이티브 버튼에 맡기고, Esc·바깥 클릭으로만 닫는다(항목이 적어 로빙 탐색은 과하다).
 */
export function OverflowMenu({ label, items }: { label: string; items: readonly OverflowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        icon="more"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div id={menuId} role="menu" aria-label={label} className="bt-menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="bt-menu__item"
              data-danger={item.danger || undefined}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.danger && <Icon name="report" size={15} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 신고 · 차단 ────────────────────────────────────────── */

export interface ReportBlockDialogProps {
  open: boolean
  onClose: () => void
  sessionId: number
  opponent: { userId: number; nickname: string }
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
  const [reasonCode, setReasonCode] = useState<ModerationReasonCode | ''>('')
  const [detail, setDetail] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 닫았다 다시 열면 이전 입력이 남아 있지 않게 초기화한다
  useEffect(() => {
    if (open) return
    setReasonCode('')
    setDetail('')
    setError(null)
  }, [open])

  const detailText = detail.trim()
  // 서버가 details 를 @NotBlank 로 받으므로 상세 없이는 제출할 수 없다
  const canSubmit = Boolean(reasonCode) && detailText.length > 0

  async function submit() {
    if (!reasonCode || !canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await reportSessionUser({
        sessionId,
        reportedUserId: opponent.userId,
        reasonCode,
        details: detailText,
      })
      // 차단 실패로 신고까지 실패한 것처럼 보이지 않게 분리해서 처리한다
      if (alsoBlock) {
        try {
          await blockUser(opponent.userId)
        } catch {
          setError('신고는 접수됐지만 차단에 실패했어요. 마이페이지에서 다시 시도해 주세요.')
          return
        }
      }
      onDone?.()
      onClose()
    } catch (submitError) {
      setError(errorMessageOf(submitError, '접수에 실패했어요. 잠시 후 다시 시도해 주세요.'))
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
            disabled={!canSubmit}
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
          {MODERATION_REASONS.map((t) => (
            <label key={t.code} className="bt-body-sm flex items-center gap-2.5">
              <input
                type="radio"
                name="report-reason"
                value={t.code}
                checked={reasonCode === t.code}
                onChange={() => setReasonCode(t.code)}
              />
              {t.label}
            </label>
          ))}
        </fieldset>

        <Field label="상세 설명" help={`필수 입력이에요. ${detail.length} / ${MODERATION_DETAIL_MAX}자`}>
          <Textarea
            rows={3}
            maxLength={MODERATION_DETAIL_MAX}
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
