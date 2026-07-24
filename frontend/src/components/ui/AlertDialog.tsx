import type { ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import type { IconName } from '../Icon'

export interface AlertDialogProps {
  open: boolean
  /** 취소/닫기 */
  onCancel: () => void
  onConfirm: () => void
  title: ReactNode
  /** 무엇이 일어나는지 한 문장으로. alertdialog 는 이 본문을 먼저 읽는다 */
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 되돌릴 수 없는 액션(신고·탈퇴·세션 종료)은 danger */
  tone?: 'default' | 'danger'
  /** danger 일 때 라벨과 함께 붙는 아이콘 (색만으로 알리지 않는다) */
  confirmIcon?: IconName
  confirmLoading?: boolean
  className?: string
}

/**
 * 확인/경고 다이얼로그 (`role="alertdialog"`).
 * 되돌릴 수 없는 액션 앞에 세운다. 배경 클릭·닫기 버튼으로 흘려보낼 수 없고, 명시적 선택만 받는다.
 * Escape 는 "취소"와 동일하게 동작한다(안전한 쪽).
 */
export function AlertDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'default',
  confirmIcon,
  confirmLoading = false,
  className,
}: AlertDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      role="alertdialog"
      showClose={false}
      closeOnBackdrop={false}
      className={className}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            leadingIcon={confirmIcon ?? (tone === 'danger' ? 'warning' : undefined)}
            loading={confirmLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description}
    </Modal>
  )
}
