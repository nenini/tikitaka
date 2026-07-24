import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../shared/lib/cn'
import { useDialogBehavior } from '../hooks/useDialogBehavior'
import { IconButton } from './IconButton'

/**
 * 접근 가능한 이름은 **필수**다. title(보이는 제목) 또는 aria-label(제목이 없는 모달) 중 하나를 반드시 준다.
 * 둘 다 주거나 둘 다 빠지면 타입 오류가 난다.
 */
export type ModalAccessibleName =
  | { title: ReactNode; 'aria-label'?: never }
  | { title?: never; 'aria-label': string }

export interface ModalBaseProps {
  open: boolean
  onClose: () => void
  children?: ReactNode
  /** 하단 액션 영역 (버튼들) */
  actions?: ReactNode
  /** 배경 클릭으로 닫기 (기본 true) */
  closeOnBackdrop?: boolean
  /** Escape 로 닫기 (기본 true). 파괴적 확인 다이얼로그는 false 를 고려한다 */
  closeOnEscape?: boolean
  /** 우상단 닫기 버튼 (기본 true). alertdialog 처럼 명시적 선택이 필요하면 false */
  showClose?: boolean
  /**
   * 'alertdialog' 는 즉시 응답이 필요한 확인/경고용. 보조기술이 본문을 먼저 읽는다.
   * @default 'dialog'
   */
  role?: 'dialog' | 'alertdialog'
  className?: string
}

export type ModalProps = ModalBaseProps & ModalAccessibleName

/**
 * 모달 다이얼로그 (`.bt-modal-root` > `.bt-scrim` + `.bt-modal`).
 *
 * 접근성 계약:
 *  - 스크림(순수 배경)만 aria-hidden 이고, 다이얼로그는 **형제**다. 접근성 트리에서 숨겨지지 않는다.
 *  - 열린 동안 Tab/Shift+Tab 이 모달 내부를 순환하고, 배경은 inert 로 상호작용이 차단된다.
 *  - title 또는 aria-label 로 접근 가능한 이름이 항상 존재한다.
 *  - 닫히면 열기 전 포커스로 복원된다.
 */
export function Modal({
  open,
  onClose,
  title,
  'aria-label': ariaLabel,
  children,
  actions,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showClose = true,
  role = 'dialog',
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const titleId = `${baseId}-title`
  const bodyId = `${baseId}-body`

  // 모달마다 자기 portal 컨테이너를 갖는다 → 배경 inert 처리에서 자신을 정확히 제외할 수 있다.
  const [container] = useState<HTMLDivElement | null>(() =>
    typeof document === 'undefined' ? null : document.createElement('div'),
  )

  useEffect(() => {
    if (!open || !container) return
    container.dataset.btPortal = 'modal'
    document.body.appendChild(container)
    return () => {
      container.remove()
    }
  }, [open, container])

  useDialogBehavior(dialogRef, { open, onClose, closeOnEscape, container })

  if (!open || !container) return null

  return createPortal(
    <div className="bt-modal-root">
      {/* 순수 배경. aria-hidden 은 여기까지만 — 다이얼로그는 형제라 영향을 받지 않는다. */}
      <div className="bt-scrim" aria-hidden="true" onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        ref={dialogRef}
        className={cn('bt-modal', className)}
        role={role}
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        aria-label={ariaLabel}
        aria-describedby={role === 'alertdialog' && children != null ? bodyId : undefined}
        tabIndex={-1}
      >
        {(title != null || showClose) && (
          <div className="bt-modal__head">
            {title != null && (
              <h2 className="bt-modal__title" id={titleId}>
                {title}
              </h2>
            )}
            {showClose && (
              <IconButton
                icon="close"
                aria-label="모달 닫기"
                className="bt-modal__close"
                onClick={onClose}
              />
            )}
          </div>
        )}
        {children != null && (
          <div className="bt-modal__body" id={bodyId}>
            {children}
          </div>
        )}
        {actions != null && <div className="bt-modal__actions">{actions}</div>}
      </div>
    </div>,
    container,
  )
}
