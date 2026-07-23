import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/shared/lib/cn'
import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** 100% 너비 */
  block?: boolean
  /** 스피너 표시 + 클릭 차단 */
  loading?: boolean
  /** 라벨 왼쪽 아이콘 */
  leadingIcon?: IconName
  /** 라벨 오른쪽 아이콘 */
  trailingIcon?: IconName
  /**
   * 컨셉아트 "매칭 시작하기" 처럼 오른쪽 끝 원형 어포던스(기본 chevrons-right).
   * trailingIcon 과 동시에 쓰지 않는다.
   */
  trailingAffordance?: boolean | IconName
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

const SIZE_CLASS: Record<ButtonSize, string | false> = {
  sm: 'bt-btn--sm',
  md: false,
  lg: 'bt-btn--lg',
}

/**
 * 디자인 시스템 Button (`.bt-btn`).
 * 규칙: 한 화면에 primary 는 하나만. 파괴적 액션(danger)에는 반드시 아이콘+라벨을 함께.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  trailingAffordance,
  disabled,
  className,
  children,
  ref,
  type = 'button',
  ...rest
}: ButtonProps) {
  const affordanceIcon: IconName | null = trailingAffordance
    ? trailingAffordance === true
      ? 'chevrons-right'
      : trailingAffordance
    : null

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'bt-btn',
        `bt-btn--${variant}`,
        SIZE_CLASS[size],
        block && 'bt-btn--block',
        loading && 'is-loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {leadingIcon && <Icon name={leadingIcon} size={18} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
      {affordanceIcon && (
        <span className="bt-btn__trailing" aria-hidden="true">
          <Icon name={affordanceIcon} size={14} strokeWidth={2.5} />
        </span>
      )}
    </button>
  )
}
