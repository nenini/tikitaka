import type { ReactNode, Ref, SelectHTMLAttributes } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import { useFieldContext } from './Field'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** 옵션 목록. children 으로 <option> 을 직접 넣고 싶으면 options 대신 children 을 쓴다 */
  options?: readonly SelectOption[]
  /** 미선택 상태에 보여줄 안내(선택 불가 옵션으로 들어간다) */
  placeholder?: string
  invalid?: boolean
  children?: ReactNode
  ref?: Ref<HTMLSelectElement>
}

/**
 * 셀렉트 (`select.bt-input`). Input/Textarea 와 같은 규칙으로 Field 컨텍스트를 자동으로 읽는다
 * — id · aria-describedby · aria-invalid · required 가 연결된다.
 *
 * 네이티브 `<select>` 를 그대로 쓴다: 모바일에서 OS 피커가 뜨고 키보드 탐색이 기본 동작한다.
 * 화살표만 `appearance: none` 대신 배경 아이콘으로 얹지 않고, 별도 span 으로 겹쳐 그린다.
 */
export function Select({
  id,
  invalid,
  required,
  className,
  options,
  placeholder,
  children,
  ref,
  'aria-describedby': describedBy,
  ...rest
}: SelectProps) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false

  return (
    <span className="bt-select">
      <select
        ref={ref}
        id={id ?? field?.id}
        className={cn('bt-input', 'bt-select__control', className)}
        aria-describedby={describedBy ?? field?.describedBy}
        aria-invalid={isInvalid || undefined}
        required={required ?? field?.required}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <Icon name="chevron-down" size={16} className="bt-select__arrow" />
    </span>
  )
}
