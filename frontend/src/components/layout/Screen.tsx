import { useId } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../shared/lib/cn'

export interface ScreenProps extends HTMLAttributes<HTMLDivElement> {
  /** 콘텐츠 최대 너비(px). web 에서 중앙 정렬. 기본 480 = 모바일 우선 폭 */
  maxWidth?: number
  /** 좌우 패딩(px). 기본 20 */
  padX?: number
  /** 상단 고정 헤더 */
  header?: ReactNode
  /** 하단 고정 요소 (BottomNav/CTA). safe-area 를 자동 처리한다 */
  footer?: ReactNode
  /** iOS 노치/홈바 safe-area inset 반영 (기본 true) */
  safeArea?: boolean
  /** "본문으로 이동" 스킵 링크 (기본 true). 헤더가 있을 때 키보드 사용자에게 특히 유효하다 */
  skipLink?: boolean
  /** 본문 요소 (기본 main). 이미 상위에 main 이 있으면 'div' 로 낮춘다 */
  contentAs?: 'main' | 'div' | 'section'
}

/**
 * 앱·웹 공용 화면 레이아웃 (`.bt-screen`).
 * - 모바일 우선: 기본 max-width 480, `100dvh` 로 화면 높이를 채운다(주소창 개폐에 안전)
 * - 웹: 넓은 화면에서 중앙 정렬되며 양옆 여백
 * - header/footer 는 시맨틱 `<header>`/`<footer>`, 본문은 `<main>` 으로 렌더된다
 * - 레이아웃 값은 CSS 변수(`--bt-screen-*`)로 나가므로 미디어 쿼리·페이지별 override 가 가능하다
 *
 * 세션처럼 다크 고정이 필요한 화면은 DarkScope 로 감싸서 사용한다.
 */
export function Screen({
  maxWidth = 480,
  padX = 20,
  header,
  footer,
  safeArea = true,
  skipLink = true,
  contentAs: Content = 'main',
  className,
  style,
  children,
  ...rest
}: ScreenProps) {
  // useId 의 원본 값에는 구분자(«r0» 등)가 섞여 있어 href="#..." 프래그먼트로 쓰기 부적합하다.
  const contentId = `bt-content-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <div
      className={cn('bt-screen', !safeArea && 'bt-screen--no-safe-area', className)}
      style={
        {
          '--bt-screen-max-width': `${maxWidth}px`,
          '--bt-screen-pad-x': `${padX}px`,
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {skipLink && (
        <a href={`#${contentId}`} className="bt-skip-link">
          본문으로 이동
        </a>
      )}

      {header && <header className="bt-screen__header">{header}</header>}

      <Content id={contentId} className="bt-screen__content" data-has-header={header ? '' : undefined}>
        {children}
      </Content>

      {footer && <footer className="bt-screen__footer">{footer}</footer>}
    </div>
  )
}
