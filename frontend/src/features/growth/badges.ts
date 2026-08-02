/**
 * 뱃지 아트 카탈로그 — `public/badges/*.png` 와 뱃지 코드를 잇는 표.
 *
 * 이름·획득 조건은 **서버(`badge_catalog`)가 정본**이라 여기 두지 않는다. 여기 있는 건
 * 코드마다 어떤 그림을 쓰느냐뿐이다. 새 뱃지가 추가되면 이미지를 넣고 이 표에 한 줄 더한다.
 *
 * 아트가 없는 코드는 화면에 그리지 않는다 — 이미지가 있는 뱃지만 나열하는 것이 W-17 규칙이다.
 */
export interface BadgeArt {
  /** public 기준 절대 경로 */
  image: string
  /** 그림 자체의 설명(뱃지 이름과 별개). 이름은 서버 값을 쓴다 */
  artAlt: string
}

export const BADGE_ART: Record<string, BadgeArt> = {
  FIRST_CHAT: { image: '/badges/badge_first_chat.png', artAlt: '하트가 달린 말풍선 두 개' },
  GOOD_LISTENER: { image: '/badges/badge_good_listener.png', artAlt: '빛나는 헤드폰' },
  AQUAMAN: { image: '/badges/badge_aquaman.png', artAlt: '마주 보는 두 마리 물고기' },
}

export function badgeArtOf(code: string): BadgeArt | null {
  return BADGE_ART[code] ?? null
}
