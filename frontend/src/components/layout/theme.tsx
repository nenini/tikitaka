import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { Button } from '../ui/Button'

/** 사용자가 고르는 값. system 은 OS 설정을 계속 따라간다. */
export type ThemeMode = 'light' | 'dark' | 'system'
/** 실제로 화면에 적용되는 값. */
export type ResolvedTheme = 'light' | 'dark'

/** @deprecated ResolvedTheme 를 사용한다. */
export type Theme = ResolvedTheme

export const THEME_STORAGE_KEY = 'bt-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export interface ThemeContextValue {
  /** 사용자가 고른 값 */
  mode: ThemeMode
  /** system 을 해석한 실제 적용값 */
  theme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  /** light ↔ dark 즉시 전환 (system 이면 현재 해석값의 반대로) */
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredMode(): ThemeMode | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : null
  } catch {
    return null
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement
  root.dataset.theme = theme
  // 폼 컨트롤·스크롤바 등 브라우저 UI 도 함께 따라오게 한다.
  root.style.colorScheme = theme
}

export interface ThemeProviderProps {
  children: ReactNode
  /** 저장값이 없을 때의 기본 모드 (기본 system) */
  defaultMode?: ThemeMode
}

/**
 * 전역 테마 Provider. **앱 최상단에 한 번만** 둔다.
 *
 * 훅을 호출할 때마다 독립 state 를 만들면 여러 위치의 토글이 서로 어긋나므로(DOM 의 data-theme 는
 * 공유되지만 React state 는 공유되지 않는다) 상태를 Context 로 끌어올린다.
 *
 * 초기 깜빡임(FOUC)은 index.html 의 동기 스크립트가 먼저 data-theme 를 칠해서 막는다.
 */
export function ThemeProvider({ children, defaultMode = 'system' }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode() ?? defaultMode)
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>(systemTheme)

  // system 모드에서는 OS 설정 변경을 계속 따라간다.
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return
    const media = window.matchMedia(DARK_QUERY)
    const handleChange = (e: MediaQueryListEvent) => setSystemResolved(e.matches ? 'dark' : 'light')
    setSystemResolved(media.matches ? 'dark' : 'light')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [mode])

  const theme: ResolvedTheme = mode === 'system' ? systemResolved : mode

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* 사파리 프라이빗 모드 등 — 저장 실패는 무시한다 */
    }
  }, [])

  const toggle = useCallback(() => {
    setMode(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setMode])

  const value = useMemo<ThemeContextValue>(() => ({ mode, theme, setMode, toggle }), [mode, theme, setMode, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** 전역 테마 상태. ThemeProvider 안에서만 호출할 수 있다. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}

const MODE_ORDER: readonly ThemeMode[] = ['light', 'dark', 'system']
const MODE_META: Record<ThemeMode, { icon: IconName; label: string }> = {
  light: { icon: 'sun', label: '라이트 모드' },
  dark: { icon: 'moon', label: '다크 모드' },
  system: { icon: 'monitor', label: '시스템 설정' },
}

export interface ThemeToggleProps {
  /** true 면 light↔dark 만 오간다 (기본은 light → dark → system 순환) */
  binary?: boolean
  /** 아이콘만 표시 */
  iconOnly?: boolean
  className?: string
}

/**
 * 전역 테마 전환 버튼.
 * 아이콘은 공통 Icon 레지스트리(sun/moon/monitor)를 쓴다 — 이모지는 OS 마다 렌더링이 달라진다.
 */
export function ThemeToggle({ binary = false, iconOnly = false, className }: ThemeToggleProps) {
  const { mode, theme, setMode, toggle } = useTheme()
  const meta = MODE_META[mode]

  const next = binary
    ? theme === 'dark'
      ? 'light'
      : 'dark'
    : MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length]

  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={binary ? toggle : () => setMode(next)}
      aria-label={`테마: ${meta.label}. 누르면 ${MODE_META[next].label}로 바뀝니다`}
    >
      <Icon name={meta.icon} size={16} />
      {!iconOnly && meta.label}
    </Button>
  )
}

export interface DarkScopeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** 전체 화면을 다크로 채울지 (기본 true → 100dvh, 배경 채움) */
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
          colorScheme: 'dark',
          color: 'var(--bt-color-text)',
          background: 'var(--bt-color-bg)',
          ...(fill ? { minHeight: '100dvh' } : null),
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </div>
  )
}
