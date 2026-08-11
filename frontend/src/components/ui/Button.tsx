import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { VisuallyHidden } from '../layout/primitives'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** 100% 너비 */
  block?: boolean
  /** 스피너 표시 + 클릭 차단 */
  loading?: boolean
  /** loading 중 스크린리더에 읽히는 상태 문구 */
  loadingLabel?: string
  /** 라벨 왼쪽 아이콘 */
  leadingIcon?: IconName
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

/**
 * 오른쪽 끝 장식은 둘 중 하나만 쓴다.
 * - trailingIcon: 라벨 옆의 평범한 아이콘
 * - trailingAffordance: 컨셉아트 "매칭 시작하기" 처럼 원형 어포던스(기본 chevrons-right)
 */
export type ButtonTrailing =
  | { trailingIcon?: IconName; trailingAffordance?: never }
  | { trailingIcon?: never; trailingAffordance: boolean | IconName }

export type ButtonProps = ButtonBaseProps & ButtonTrailing

const SIZE_CLASS: Record<ButtonSize, string | false> = {
  sm: 'bt-btn--sm',
  md: false,
  lg: 'bt-btn--lg',
}

const SPINNER_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 }

/**
 * 디자인 시스템 Button (`.bt-btn`).
 * 규칙: 한 화면에 primary 는 하나만. 파괴적 액션(danger)에는 반드시 아이콘+라벨을 함께.
 *
 * loading 은 CSS pseudo-element 가 아니라 실제 Spinner 컴포넌트를 렌더한다 —
 * 테스트에서 조회 가능하고, 상태 문구가 스크린리더에 한 번만 전달된다.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  loading = false,
  loadingLabel = '처리 중',
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
      {loading ? (
        <>
          <Spinner size={SPINNER_SIZE[size]} label={null} />
          <VisuallyHidden>{loadingLabel}</VisuallyHidden>
        </>
      ) : (
        leadingIcon && <Icon name={leadingIcon} size={18} />
      )}
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
