import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/components/ui/Button'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'bt-theme'

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/**
 * 전역 라이트/다크 테마 훅. document.documentElement 의 data-theme 를 제어하고 localStorage 에 저장한다.
 * 저장값이 없으면 OS 설정(prefers-color-scheme)을 따른다.
 * ⚠️ 세션/대기방처럼 **항상 다크**여야 하는 화면은 전역 테마와 무관하게 DarkScope 로 감싼다.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'light'
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'light' || attr === 'dark') return attr
    const stored = readStored()
    if (stored) return stored
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* 저장 실패는 무시 */
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme])

  return { theme, setTheme, toggle }
}

/** 전역 테마 토글 버튼. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <Button variant="secondary" size="sm" onClick={toggle} aria-pressed={dark} className={className}>
      <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
      {dark ? '라이트 모드' : '다크 모드'}
    </Button>
  )
}

export interface DarkScopeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** 전체 화면을 다크로 채울지 (기본 true → min-height:100%, 배경 채움) */
  fill?: boolean
}

/**
 * 서브트리를 **항상 다크**로 고정하는 래퍼 (세션 §7.3).
 * data-theme="dark" 를 걸면 변수는 바뀌지만 color 는 상위 계산값이 상속되므로,
 * 경계에서 color/background 를 다시 잡아준다. (tokens.css 의 `[data-theme]` 규칙 + 여기서 배경)
 */
export function DarkScope({ fill = true, className, style, children, ...rest }: DarkScopeProps) {
  return (
    <div
      data-theme="dark"
      className={cn('bt-dark-scope', className)}
      style={
        {
          color: 'var(--bt-color-text)',
          background: 'var(--bt-color-bg)',
          ...(fill ? { minHeight: '100%' } : null),
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </div>
  )
}
