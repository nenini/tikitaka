import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export type AvatarSize = 'sm' | 'md' | 'lg'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  size?: AvatarSize
  /** 완전 원형 */
  round?: boolean
  src?: string
  alt?: string
  /** 접속 상태 dot. 'online' 이면 초록, 그 외 회색 */
  status?: 'online' | 'offline'
  /** 이미지가 없을 때 표시할 이니셜/이모지 */
  fallback?: string
}

const SIZE_CLASS: Record<AvatarSize, string | false> = {
  sm: 'bt-avatar--sm',
  md: false,
  lg: 'bt-avatar--lg',
}

/** 아바타 (`.bt-avatar`). 최소 공개 원칙상 상대 정보는 닉네임·연령대·얼굴상만 노출한다. */
export function Avatar({ size = 'md', round = false, src, alt = '', status, fallback, className, style, ...rest }: AvatarProps) {
  return (
    <span
      className={cn('bt-avatar', SIZE_CLASS[size], round && 'bt-avatar--round', className)}
      style={style}
      {...rest}
    >
      {src ? (
        <img src={src} alt={alt} />
      ) : fallback ? (
        <span
          aria-hidden="true"
          style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: 'var(--bt-color-text-secondary)', fontWeight: 600 }}
        >
          {fallback}
        </span>
      ) : null}
      {status && (
        <span className={cn('bt-avatar__status', status === 'online' && 'bt-avatar__status--online')} />
      )}
    </span>
  )
}
