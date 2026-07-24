import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ElementType, HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../shared/lib/cn'

export type CardVariant = 'default' | 'glass' | 'inset' | 'flat'

const VARIANT_CLASS: Record<CardVariant, string | false> = {
  default: false,
  glass: 'bt-card--glass',
  inset: 'bt-card--inset',
  flat: 'bt-card--flat',
}

function cardClass(variant: CardVariant, interactive: boolean, className?: string) {
  return cn('bt-card', VARIANT_CLASS[variant], interactive && 'bt-card--interactive', className)
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  /**
   * hover 시 살짝 떠오르는 시각 효과만 준다. **클릭 대상이라면 CardButton/CardLink 를 쓴다** —
   * div 에 onClick 만 붙이면 키보드로 도달·활성화할 수 없다.
   */
  interactive?: boolean
}

/** 카드 컨테이너 (`.bt-card`). 비상호작용 컨테이너. */
export function Card({ variant = 'default', interactive = false, className, children, ...rest }: CardProps) {
  if (import.meta.env.DEV && rest.onClick && !rest.role) {
    console.warn(
      '[Card] div 에 onClick 만 붙이면 키보드 사용자가 활성화할 수 없습니다. CardButton 또는 CardLink 를 사용하세요.',
    )
  }
  return (
    <div className={cardClass(variant, interactive, className)} {...rest}>
      {children}
    </div>
  )
}

/* ── CardButton ─────────────────────────────────────────── */
export interface CardButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CardVariant
  ref?: Ref<HTMLButtonElement>
}

/** 눌러서 동작을 실행하는 카드. 실제 `<button>` 이라 포커스·Enter/Space 가 기본 동작한다. */
export function CardButton({
  variant = 'default',
  className,
  children,
  ref,
  type = 'button',
  ...rest
}: CardButtonProps) {
  return (
    <button ref={ref} type={type} className={cn(cardClass(variant, true, className), 'bt-card--control')} {...rest}>
      {children}
    </button>
  )
}

/* ── CardLink ───────────────────────────────────────────── */
export type CardLinkProps<E extends ElementType = 'a'> = {
  /** 라우터 비종속. react-router 를 쓰면 `as={Link} to="/report"` 로 넘긴다 */
  as?: E
  variant?: CardVariant
  children?: ReactNode
  className?: string
} & Omit<ComponentPropsWithoutRef<E>, 'as' | 'variant' | 'className' | 'children'>

/** 다른 화면으로 이동하는 카드. 기본은 `<a>`, `as` 로 라우터 Link 를 끼울 수 있다. */
export function CardLink<E extends ElementType = 'a'>({
  as,
  variant = 'default',
  className,
  children,
  ...rest
}: CardLinkProps<E>) {
  const Comp = (as ?? 'a') as ElementType
  return (
    <Comp className={cn(cardClass(variant, true, className), 'bt-card--control')} {...rest}>
      {children}
    </Comp>
  )
}

/* ── CardHeader ─────────────────────────────────────────── */
export interface CardHeaderProps {
  title?: ReactNode
  action?: ReactNode
  className?: string
  children?: ReactNode
}

/** 카드 헤더 — 좌측 타이틀, 우측 액션. (`.bt-card__head`) */
export function CardHeader({ title, action, className, children }: CardHeaderProps) {
  return (
    <div className={cn('bt-card__head', className)}>
      {title != null ? <span className="bt-card__title">{title}</span> : children}
      {action}
    </div>
  )
}
