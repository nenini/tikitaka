import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/shared/lib/cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
  /** 하단 액션 영역 (버튼들) */
  actions?: ReactNode
  /** 배경 클릭으로 닫기 (기본 true) */
  closeOnBackdrop?: boolean
  className?: string
}

/**
 * 모달 다이얼로그 (`.bt-scrim` + `.bt-modal`).
 * - Escape / 배경 클릭으로 닫힌다
 * - 열릴 때 스크롤 잠금 + 모달로 포커스 이동, 닫힐 때 이전 포커스 복원
 * - role="dialog" aria-modal, 제목과 aria-labelledby 연결
 */
export function Modal({ open, onClose, title, children, actions, closeOnBackdrop = true, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      restoreFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div
        className="bt-scrim"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <div
          ref={dialogRef}
          className={cn('bt-modal', className)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title != null ? titleId : undefined}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          {title != null && (
            <h2 className="bt-modal__title" id={titleId}>
              {title}
            </h2>
          )}
          {children != null && <div className="bt-modal__body">{children}</div>}
          {actions != null && <div className="bt-modal__actions">{actions}</div>}
        </div>
      </div>
    </>,
    document.body,
  )
}
