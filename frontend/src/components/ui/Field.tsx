import { createContext, useContext, useId } from 'react'
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'

/* ── Field ────────────────────────────────────────────────
   label + control + help/error 를 한 벌로 묶고, id/aria 연결을 **자동**으로 처리한다.

   세 가지 사용법 모두 label↔input 이 연결된다:
     1) <Field label="닉네임"><Input /></Field>                    ← Input 이 컨텍스트를 읽는다
     2) <Field><Field.Label>닉네임</Field.Label><Field.Input /></Field>  ← 합성 패턴
     3) <Field label="닉네임">{({ id }) => <input id={id} />}</Field>     ← 서드파티 컨트롤용 render prop

   RHF: <Field label error={errors.x?.message}><Input {...register('x')} /></Field>
   ──────────────────────────────────────────────────────── */

export interface FieldContextValue {
  id: string
  describedBy?: string
  invalid: boolean
  required: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

/** Field 안에서 id/aria 연결 정보를 읽는다. Field 밖이면 null. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext)
}

export interface FieldProps {
  /** 컨트롤과 연결할 id (미지정 시 자동 생성) */
  id?: string
  label?: ReactNode
  required?: boolean
  help?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode | ((ids: FieldContextValue) => ReactNode)
}

export function Field({ id: idProp, label, required = false, help, error, className, children }: FieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const invalid = Boolean(error)
  const describedBy = error ? errorId : help ? helpId : undefined

  const ctx: FieldContextValue = { id, describedBy, invalid, required }

  return (
    <FieldContext.Provider value={ctx}>
      <div className={cn('bt-field', className)}>
        {label != null && <FieldLabel>{label}</FieldLabel>}
        {typeof children === 'function' ? children(ctx) : children}
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
    </FieldContext.Provider>
  )
}

/* ── Field.Label ────────────────────────────────────────── */
export interface FieldLabelProps extends Omit<LabelHTMLAttributes<HTMLLabelElement>, 'htmlFor'> {
  children: ReactNode
}

function FieldLabel({ className, children, ...rest }: FieldLabelProps) {
  const field = useFieldContext()
  return (
    <label className={cn('bt-label', className)} htmlFor={field?.id} {...rest}>
      {children}
      {field?.required && (
        <span className="bt-label__req" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}

/* ── Input ──────────────────────────────────────────────── */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

/**
 * 텍스트 인풋 (`.bt-input`). RHF register() 스프레드 호환.
 * Field 안에 있으면 id · aria-describedby · aria-invalid · required 가 자동 연결된다.
 * 명시적으로 넘긴 prop 이 항상 우선한다.
 */
export function Input({
  id,
  invalid,
  required,
  className,
  ref,
  'aria-describedby': describedBy,
  ...rest
}: InputProps) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  return (
    <input
      ref={ref}
      id={id ?? field?.id}
      className={cn('bt-input', className)}
      aria-describedby={describedBy ?? field?.describedBy}
      aria-invalid={isInvalid || undefined}
      required={required ?? field?.required}
      {...rest}
    />
  )
}

/* ── Textarea ───────────────────────────────────────────── */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

/** 여러 줄 인풋 (`textarea.bt-input`). Input 과 동일하게 Field 컨텍스트를 자동으로 읽는다. */
export function Textarea({
  id,
  invalid,
  required,
  className,
  ref,
  'aria-describedby': describedBy,
  ...rest
}: TextareaProps) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  return (
    <textarea
      ref={ref}
      id={id ?? field?.id}
      className={cn('bt-input', className)}
      aria-describedby={describedBy ?? field?.describedBy}
      aria-invalid={isInvalid || undefined}
      required={required ?? field?.required}
      {...rest}
    />
  )
}

/* ── 합성 API ────────────────────────────────────────────
   <Field><Field.Label>닉네임</Field.Label><Field.Input /></Field> */
Field.Label = FieldLabel
Field.Input = Input
Field.Textarea = Textarea
