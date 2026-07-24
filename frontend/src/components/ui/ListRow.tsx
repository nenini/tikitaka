import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ElementType, HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../shared/lib/cn'

/* 목록 행 (`.bt-row`) — 연습 기록 등.
   역할별로 요소를 나눈다. 버튼 안에 또 버튼(메뉴·체크박스)을 넣으면 유효하지 않은 중첩 인터랙션이 된다.
     <ListRow />        비상호작용 (정보 표시 · 내부에 체크박스/메뉴 버튼 배치 가능)
     <ListRowButton />  onClick
     <ListRowLink />    화면 이동 */

export interface ListRowContent {
  /** 왼쪽 요소 (아바타 등) */
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  /** 오른쪽 요소 (점수 링·뱃지·chevron 등) */
  trailing?: ReactNode
}

function RowInner({ leading, title, meta, trailing }: ListRowContent) {
  return (
    <>
      {leading}
      <span className="bt-row__main">
        <span className="bt-row__title">{title}</span>
        {meta != null && <span className="bt-row__meta">{meta}</span>}
      </span>
      {trailing}
    </>
  )
}

/* ── ListRow (비상호작용) ────────────────────────────────── */
export interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>, ListRowContent {
  ref?: Ref<HTMLDivElement>
}

/** 정보 표시 전용 행. 내부에 체크박스·메뉴 버튼 같은 자체 인터랙션을 넣을 수 있다. */
export function ListRow({ leading, title, meta, trailing, className, ref, ...rest }: ListRowProps) {
  return (
    <div ref={ref} className={cn('bt-row', className)} {...rest}>
      <RowInner leading={leading} title={title} meta={meta} trailing={trailing} />
    </div>
  )
}

/* ── ListRowButton ──────────────────────────────────────── */
export interface ListRowButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'>,
    ListRowContent {
  ref?: Ref<HTMLButtonElement>
}

/** 눌러서 동작을 실행하는 행. */
export function ListRowButton({
  leading,
  title,
  meta,
  trailing,
  className,
  ref,
  type = 'button',
  ...rest
}: ListRowButtonProps) {
  return (
    <button ref={ref} type={type} className={cn('bt-row', 'bt-row--control', className)} {...rest}>
      <RowInner leading={leading} title={title} meta={meta} trailing={trailing} />
    </button>
  )
}

/* ── ListRowLink ────────────────────────────────────────── */
export type ListRowLinkProps<E extends ElementType = 'a'> = {
  /** 라우터 비종속. react-router 를 쓰면 `as={Link} to="/report/1"` 로 넘긴다 */
  as?: E
  className?: string
} & ListRowContent &
  Omit<ComponentPropsWithoutRef<E>, 'as' | 'className' | keyof ListRowContent>

/** 상세 화면으로 이동하는 행. 기본은 `<a>`, `as` 로 라우터 Link 를 끼울 수 있다. */
export function ListRowLink<E extends ElementType = 'a'>({
  as,
  leading,
  title,
  meta,
  trailing,
  className,
  ...rest
}: ListRowLinkProps<E>) {
  const Comp = (as ?? 'a') as ElementType
  return (
    <Comp className={cn('bt-row', 'bt-row--control', className)} {...rest}>
      <RowInner leading={leading} title={title} meta={meta} trailing={trailing} />
    </Comp>
  )
}
