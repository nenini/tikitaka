import type { ReactNode, SVGProps } from 'react'
import { cn } from '../shared/lib/cn'

/**
 * 인라인 SVG 아이콘 레지스트리.
 * preview.html 에서 쓰인 24×24 아이콘들을 그대로 옮겨왔고, 팀 공용으로 자주 쓰는 것들을 추가했다.
 * 색은 항상 currentColor 를 따르므로 부모의 `color`(= 디자인 시스템 semantic 토큰)로 제어한다.
 *
 *   <Icon name="mic" size={19} />
 *   <button className="bt-btn bt-btn--danger"><Icon name="report" size={15} /> 신고</button>
 *
 * 네이밍 규칙: **kebab-case 고정** (`camera-flip`, `heart-fill`). 객체 키를 문자열로 관리하므로
 * snake_case/camelCase 를 섞지 않는다.
 * 아이콘이 50개를 넘어가면 icons/{navigation,action,status,session}.tsx 로 분할한다.
 */

type Paint = 'stroke' | 'fill'
interface IconDef {
  paint: Paint
  body: ReactNode
}
/** 모든 아이콘은 24×24 그리드 기준으로 그린다. */
const VIEW_BOX = '0 0 24 24'

// prettier-ignore
const ICONS = {
  // ── navigation / chrome ────────────────────────────────
  home:        { paint: 'stroke', body: <path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" /> },
  heart:       { paint: 'stroke', body: <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 000-7.8z" /> },
  'heart-fill':{ paint: 'fill',   body: <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 000-7.8z" /> },
  chart:       { paint: 'stroke', body: <path d="M6 20V10M12 20V4M18 20v-6" /> },
  user:        { paint: 'stroke', body: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></> },
  bell:        { paint: 'stroke', body: <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /> },
  settings:    { paint: 'stroke', body: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 003.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.08a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.08a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></> },

  // ── actions / arrows ───────────────────────────────────
  'chevron-right':   { paint: 'stroke', body: <path d="M9 6l6 6-6 6" /> },
  'chevron-left':    { paint: 'stroke', body: <path d="M15 6l-6 6 6 6" /> },
  'chevron-down':    { paint: 'stroke', body: <path d="M6 9l6 6 6-6" /> },
  'chevrons-right':  { paint: 'stroke', body: <path d="M13 17l5-5-5-5M6 17l5-5-5-5" /> }, // 버튼 trailing 어포던스
  'arrow-up':        { paint: 'stroke', body: <path d="M12 19V5M5 12l7-7 7 7" /> },   // 온도 상승
  'arrow-down':      { paint: 'stroke', body: <path d="M12 5v14M19 12l-7 7-7-7" /> }, // 온도 하락
  plus:              { paint: 'stroke', body: <path d="M12 5v14M5 12h14" /> },
  more:              { paint: 'stroke', body: <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth={2.6} /> }, // 오버플로 메뉴
  close:             { paint: 'stroke', body: <path d="M18 6L6 18M6 6l12 12" /> },
  check:             { paint: 'stroke', body: <path d="M20 6L9 17l-5-5" /> },
  search:            { paint: 'stroke', body: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
  refresh:           { paint: 'stroke', body: <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" /> },
  send:              { paint: 'stroke', body: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /> },
  logout:            { paint: 'stroke', body: <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /> },

  // ── status / feedback ──────────────────────────────────
  'info-circle':     { paint: 'stroke', body: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></> },
  'error-circle':    { paint: 'stroke', body: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></> },
  warning:           { paint: 'stroke', body: <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01" /> },
  'check-circle':    { paint: 'stroke', body: <><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></> },
  sparkle:           { paint: 'fill',   body: <path d="M12 2l1.9 5.8L20 9.7l-4.9 3.6L17 19l-5-3.4L7 19l1.9-5.7L4 9.7l6.1-1.9z" /> }, // AI 코치 뱃지
  help:              { paint: 'stroke', body: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01" /></> },
  report:            { paint: 'stroke', body: <path d="M4 21V4M4 4h13l-2 4 2 4H4" /> }, // 신고 깃발
  lock:              { paint: 'stroke', body: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></> },
  eye:               { paint: 'stroke', body: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></> },
  target:            { paint: 'stroke', body: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12h.01" /></> }, // 세션 목표
  bulb:              { paint: 'stroke', body: <><path d="M15.1 14.2a5.5 5.5 0 10-6.2 0c.7.5 1.1 1.3 1.1 2.1h4c0-.8.4-1.6 1.1-2.1z" /><path d="M9.5 19.5h5M10.5 22h3" /></> }, // 대체 제안
  wrench:            { paint: 'stroke', body: <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.8-3.8a6 6 0 01-8 8l-6.9 6.9a2.1 2.1 0 01-3-3l6.9-6.9a6 6 0 018-8l-3.8 3.8z" /> }, // 생성 실패·복구
  medal:             { paint: 'stroke', body: <><circle cx="12" cy="15" r="6" /><path d="M8.6 10.4L5.5 3h4.9L12 6.3 13.6 3h4.9l-3.1 7.4" /></> }, // 뱃지 기본
  bot:               { paint: 'stroke', body: <><rect x="4" y="8" width="16" height="12" rx="3.5" /><path d="M12 8V4.5M9.5 13.5h.01M14.5 13.5h.01M9.5 16.8c1.6.9 3.4.9 5 0" /></> }, // AI 상대

  // ── session / call controls ────────────────────────────
  mic:         { paint: 'stroke', body: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4" /></> },
  'mic-off':   { paint: 'stroke', body: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4M2 2l20 20" /></> },
  camera:      { paint: 'stroke', body: <path d="M15 10l6-4v12l-6-4M3 6h12v12H3z" /> },
  'camera-off':{ paint: 'stroke', body: <><path d="M15 10l6-4v12l-6-4M3 6h12v12H3z" /><path d="M2 2l20 20" /></> },
  chat:        { paint: 'stroke', body: <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /> },
  'phone-end': { paint: 'fill',   body: <path d="M12 9c-1.6 0-3.2.3-4.6.8v3.1c0 .4-.2.8-.6 1-.9.4-1.7 1-2.4 1.7-.2.2-.4.3-.7.3s-.5-.1-.7-.3l-2-2c-.2-.2-.3-.4-.3-.7s.1-.5.3-.7C3.9 9.8 7.8 8.2 12 8.2s8.1 1.6 11 4c.2.2.3.4.3.7s-.1.5-.3.7l-2 2c-.2.2-.4.3-.7.3s-.5-.1-.7-.3c-.7-.7-1.5-1.3-2.4-1.7-.4-.2-.6-.6-.6-1V9.8C15.2 9.3 13.6 9 12 9z" /> },
  clock:       { paint: 'stroke', body: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  speaker:     { paint: 'stroke', body: <><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.4 8.6a4.8 4.8 0 010 6.8M18.4 5.6a9 9 0 010 12.8" /></> },
  'speaker-off': { paint: 'stroke', body: <><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></> },
  'camera-flip': { paint: 'stroke', body: <><path d="M15 10l6-4v12l-6-4M3 6h12v12H3z" /><path d="M6 14a3 3 0 015.2-2M12 10a3 3 0 01-5.2 2" /><path d="M11 11.5L11.4 8M6.6 12.5L6.2 16" /></> },
  signal:      { paint: 'stroke', body: <path d="M4 20v-4M9 20v-8M14 20V8M19 20V4" /> },

  // ── theme ──────────────────────────────────────────────
  sun:         { paint: 'stroke', body: <><circle cx="12" cy="12" r="4.5" /><path d="M12 1.5v2.5M12 20v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1.5 12h2.5M20 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" /></> },
  moon:        { paint: 'stroke', body: <path d="M20.5 14.6A8.5 8.5 0 019.4 3.5a8.5 8.5 0 1011.1 11.1z" /> },
  monitor:     { paint: 'stroke', body: <><rect x="2.5" y="4" width="19" height="12.5" rx="2" /><path d="M8.5 20.5h7M12 16.5v4" /></> },

  // ── brand ──────────────────────────────────────────────
  bloom: { paint: 'fill', body: <><ellipse cx="12" cy="5.6" rx="3.3" ry="4.4" /><ellipse cx="12" cy="18.4" rx="3.3" ry="4.4" /><ellipse cx="5.6" cy="12" rx="4.4" ry="3.3" /><ellipse cx="18.4" cy="12" rx="4.4" ry="3.3" /><circle cx="12" cy="12" r="2.4" fill="var(--bt-color-surface)" /></> },
} satisfies Record<string, IconDef>

export type IconName = keyof typeof ICONS

/** Storybook/갤러리에서 전체 아이콘 그리드를 만들어 시각 검수할 때 사용한다. */
export const iconNames = Object.keys(ICONS) as IconName[]

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** px. width=height 로 정사각 렌더 (기본 20) */
  size?: number | string
  /** stroke 아이콘의 선 굵기 (기본 2) */
  strokeWidth?: number
  /** 의미 있는 아이콘의 접근 가능한 이름. 주면 role="img" 로 노출된다 */
  title?: string
}

/**
 * 기본은 **장식용**(aria-hidden). 아이콘에 의미가 있으면 title 이나 aria-label/aria-labelledby 를 준다.
 * 하나라도 있으면 aria-hidden 을 붙이지 않는다 — 접근 가능한 이름을 주고도 숨겨지는 사고를 막는다.
 */
export function Icon({ name, size = 20, strokeWidth = 2, title, className, ...rest }: IconProps) {
  const def = ICONS[name]
  const paint =
    def.paint === 'stroke'
      ? { fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
      : { fill: 'currentColor' }

  const accessible = Boolean(title) || Boolean(rest['aria-label']) || Boolean(rest['aria-labelledby'])

  return (
    <svg
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      className={cn('bt-icon', className)}
      role={accessible ? 'img' : undefined}
      aria-hidden={accessible ? undefined : true}
      aria-label={title ?? rest['aria-label']}
      focusable="false"
      {...paint}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {def.body}
    </svg>
  )
}
