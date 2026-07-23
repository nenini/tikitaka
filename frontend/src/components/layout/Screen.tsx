import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export interface ScreenProps extends HTMLAttributes<HTMLDivElement> {
  /** 콘텐츠 최대 너비 (web 에서 중앙 정렬). 기본 480 = 모바일 우선 폭 */
  maxWidth?: number
  /** 좌우 패딩(px). 기본 20 */
  padX?: number
  /** 하단 고정 요소 (BottomNav/CTA). safe-area 를 자동 처리하고 콘텐츠 하단 여백을 확보한다 */
  footer?: ReactNode
  /** 상단 고정 헤더 */
  header?: ReactNode
  /** iOS 노치/홈바 safe-area inset 반영 (기본 true) */
  safeArea?: boolean
}

/**
 * 앱·웹 공용 화면 레이아웃.
 * - 모바일 우선: 기본 max-width 480, 세로 100% 채움
 * - 웹: 넓은 화면에서 중앙 정렬되며 양옆 여백
 * - footer 를 주면 하단 고정 + safe-area(iOS 홈바) 처리 + 콘텐츠 스크롤 영역 확보
 *
 * 세션처럼 다크 고정이 필요한 화면은 DarkScope 로 감싸서 사용한다.
 */
export function Screen({
  maxWidth = 480,
  padX = 20,
  header,
  footer,
  safeArea = true,
  className,
  style,
  children,
  ...rest
}: ScreenProps) {
  const safeTop = safeArea ? 'env(safe-area-inset-top, 0px)' : '0px'
  const safeBottom = safeArea ? 'env(safe-area-inset-bottom, 0px)' : '0px'

  return (
    <div
      className={cn('bt-screen', className)}
      style={
        {
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100%',
          width: '100%',
          maxWidth,
          marginInline: 'auto',
          position: 'relative',
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {header && (
        <div style={{ position: 'sticky', top: 0, zIndex: 'var(--bt-z-sticky)' as unknown as number, paddingTop: safeTop }}>
          {header}
        </div>
      )}

      <div style={{ flex: 1, paddingInline: padX, paddingTop: header ? undefined : `calc(${safeTop} + 8px)` }}>
        {children}
      </div>

      {footer && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            paddingInline: padX,
            paddingBottom: `calc(${safeBottom} + 12px)`,
            paddingTop: 8,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
