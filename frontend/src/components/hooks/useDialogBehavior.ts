import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * 다이얼로그 동작(포커스 트랩 · 배경 비활성 · 스크롤 잠금 · Escape · 포커스 복원)을 한 벌로 묶은 훅.
 *
 * WAI-ARIA modal 패턴 요구사항:
 *  - 열린 동안 Tab 순환이 다이얼로그 내부에 머문다
 *  - 배경 콘텐츠는 상호작용/보조기술 탐색이 불가능하다 (inert)
 *  - 닫히면 열기 전 포커스로 되돌아간다
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'details > summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** root 안에서 실제로 포커스를 받을 수 있는 요소들 (DOM 순서). */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('inert') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0),
  )
}

/* ── body 스크롤 잠금 ── 중첩 다이얼로그를 위해 참조 카운트로 관리한다. */
let scrollLockCount = 0
let scrollLockPrevOverflow = ''

function lockScroll() {
  if (scrollLockCount === 0) {
    scrollLockPrevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) document.body.style.overflow = scrollLockPrevOverflow
}

/** portal 컨테이너를 제외한 body 직계 자식을 inert 처리하고, 해제 함수를 돌려준다. */
function inertBackground(except: HTMLElement | null): () => void {
  const marked: HTMLElement[] = []
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue
    if (child === except || child.contains(except)) continue
    if (child.hasAttribute('inert')) continue // 상위 다이얼로그가 이미 처리함
    child.setAttribute('inert', '')
    marked.push(child)
  }
  return () => marked.forEach((el) => el.removeAttribute('inert'))
}

export interface DialogBehaviorOptions {
  open: boolean
  onClose: () => void
  /** Escape 로 닫기 (기본 true) */
  closeOnEscape?: boolean
  /** inert 대상에서 제외할 portal 컨테이너 */
  container?: HTMLElement | null
}

export function useDialogBehavior(
  dialogRef: RefObject<HTMLElement | null>,
  { open, onClose, closeOnEscape = true, container = null }: DialogBehaviorOptions,
) {
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return

    const restoreTo = document.activeElement as HTMLElement | null
    const releaseInert = inertBackground(container)
    lockScroll()

    // 초기 포커스: 첫 포커서블 → 없으면 다이얼로그 컨테이너(tabIndex={-1})
    const initial = getFocusable(dialog)[0] ?? dialog
    initial.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const items = getFocusable(dialog)
      if (items.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      // 포커스가 다이얼로그 밖으로 나갔거나 경계에 있으면 반대편으로 순환시킨다.
      if (e.shiftKey) {
        if (active === first || active === dialog || !dialog.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    // capture 단계 — 내부 컴포넌트가 keydown 을 멈춰도 트랩은 유지된다.
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      unlockScroll()
      releaseInert()
      restoreTo?.focus?.()
    }
  }, [open, onClose, closeOnEscape, container, dialogRef])
}
