import type { HTMLAttributes } from 'react'
import { cn } from '../../shared/lib/cn'
import { VisuallyHidden } from '../layout/primitives'

export type AvatarSize = 'sm' | 'md' | 'lg'
export type AvatarStatus = 'online' | 'offline'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  size?: AvatarSize
  /** 완전 원형 */
  round?: boolean
  src?: string
  /** 누구의 아바타인지. 접근 가능한 이름과 이니셜 fallback 의 근거가 된다 */
  name?: string
  /**
   * 순수 장식(옆에 이름이 이미 텍스트로 있음)이면 true — 접근성 트리에서 제외한다.
   * name 이 없으면 자동으로 장식 취급된다.
   */
  decorative?: boolean
  /** 접속 상태 dot. 색뿐 아니라 스크린리더용 텍스트도 함께 나간다 */
  status?: AvatarStatus
  /** 이미지가 없을 때 표시할 이니셜/이모지 (미지정 시 name 의 첫 글자) */
  fallback?: string
}

const SIZE_CLASS: Record<AvatarSize, string | false> = {
  sm: 'bt-avatar--sm',
  md: false,
  lg: 'bt-avatar--lg',
}

const STATUS_TEXT: Record<AvatarStatus, string> = { online: '온라인', offline: '오프라인' }

/** 아바타 (`.bt-avatar`). 최소 공개 원칙상 상대 정보는 닉네임·연령대·얼굴상만 노출한다. */
export function Avatar({
  size = 'md',
  round = false,
  src,
  name,
  decorative,
  status,
  fallback,
  className,
  style,
  ...rest
}: AvatarProps) {
  const isDecorative = decorative ?? !name
  const initial = fallback ?? (name ? Array.from(name)[0] : undefined)

  return (
    <span
      className={cn('bt-avatar', SIZE_CLASS[size], round && 'bt-avatar--round', className)}
      style={style}
      role={isDecorative ? undefined : 'img'}
      aria-label={isDecorative ? undefined : `${name} 프로필`}
      // 장식용이면 서브트리 전체가 접근성 트리에서 빠진다 (상태 dot 포함 — 전달할 의미가 없다)
      aria-hidden={isDecorative || undefined}
      {...rest}
    >
      {src ? (
        <img src={src} alt="" />
      ) : initial ? (
        <span className="bt-avatar__fallback" aria-hidden="true">
          {initial}
        </span>
      ) : null}
      {status && (
        <>
          <span
            className={cn('bt-avatar__status', status === 'online' && 'bt-avatar__status--online')}
            aria-hidden="true"
          />
          <VisuallyHidden>{STATUS_TEXT[status]}</VisuallyHidden>
        </>
      )}
    </span>
  )
}
