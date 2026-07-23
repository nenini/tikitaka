/**
 * 조건부 className 합성 유틸. (clsx 미니 버전)
 * falsy 값은 무시하고 공백으로 join 한다.
 *
 *   cn('bt-btn', variant && `bt-btn--${variant}`, isLoading && 'is-loading')
 */
export type ClassValue = string | number | false | null | undefined

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
