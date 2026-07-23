import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'
import { Icon } from '@/components/Icon'

/* ── Field wrapper ────────────────────────────────────────
   label + control + help/error 를 한 벌로 묶는다.
   RHF 와 함께 쓸 때: <Field label error={errors.x?.message}><Input {...register('x')} /></Field>
   컨트롤에 id/aria 를 자동 연결하려면 render-prop 형태를 쓴다. */

export interface FieldProps {
  label?: ReactNode
  required?: boolean
  help?: ReactNode
  error?: ReactNode
  className?: string
  /** id/aria 연결이 필요하면 함수형 children 사용 */
  children: ReactNode | ((ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode)
}

export function Field({ label, required, help, error, className, children }: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const invalid = Boolean(error)
  const describedBy = error ? errorId : help ? helpId : undefined

  return (
    <div className={cn('bt-field', className)}>
      {label != null && (
        <label className="bt-label" htmlFor={id}>
          {label}
          {required && (
            <span className="bt-label__req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {typeof children === 'function' ? children({ id, describedBy, invalid }) : children}
      {error ? (
        <span className="bt-error" id={errorId} role="alert">
          <Icon name="error-circle" size={12} strokeWidth={2.5} />
          {error}
        </span>
      ) : help ? (
        <span className="bt-help" id={helpId}>
          {help}
        </span>
      ) : null}
    </div>
  )
}

/* ── Input ──────────────────────────────────────────────── */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

/** 텍스트 인풋 (`.bt-input`). RHF register() 스프레드 호환. */
export function Input({ invalid, className, ref, ...rest }: InputProps) {
  return (
    <input ref={ref} className={cn('bt-input', className)} aria-invalid={invalid || undefined} {...rest} />
  )
}

/* ── Textarea ───────────────────────────────────────────── */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

/** 여러 줄 인풋 (`textarea.bt-input`). */
export function Textarea({ invalid, className, ref, ...rest }: TextareaProps) {
  return (
    <textarea ref={ref} className={cn('bt-input', className)} aria-invalid={invalid || undefined} {...rest} />
  )
}
