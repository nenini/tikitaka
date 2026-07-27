import { apiClient } from '@/shared/api/client'
import type { RoomBundle, RoomTheme } from './types'

/**
 * 대기방 REST. (기기 점검은 클라 전용이라 여기 없음 — 테마·목표 번들과 입장만 서버로 간다)
 *   GET  /api/sessions/{id}/room   — 테마·일정·목표 번들
 *   POST /api/sessions/{id}/join   — 입장(participation_status → JOINED)
 */

export async function fetchRoomBundle(sessionId: string): Promise<RoomBundle> {
  const { data } = await apiClient.get<RoomBundle>(`/sessions/${sessionId}/room`)
  return data
}

/** 입장하기 CTA. 성공 시 WebRTC 연결(트랙 2)로 넘어간다. */
export async function joinSession(sessionId: string): Promise<void> {
  await apiClient.post(`/sessions/${sessionId}/join`)
}

/**
 * 시간대 → 상황 테마 자동 배정 표(room_themes 폴백).
 * 서버 번들을 못 받았을 때 scheduledStartAt(또는 현재 시각)의 "시" 기준으로 배정한다.
 * 실제 배정 규칙은 서버(room_themes.startTime~endTime)가 SSOT이며, 여기는 데모/오프라인 폴백용.
 */
const THEME_SLOTS: ReadonlyArray<{ from: number; to: number; theme: RoomTheme; emoji: string }> = [
  { from: 6, to: 11, emoji: '☕', theme: { roomThemeId: 1, name: '아침 카페', placeType: 'CAFE', startTime: '06:00', endTime: '11:00' } },
  { from: 11, to: 14, emoji: '🍽', theme: { roomThemeId: 2, name: '점심 식당', placeType: 'RESTAURANT', startTime: '11:00', endTime: '14:00' } },
  { from: 14, to: 17, emoji: '🌳', theme: { roomThemeId: 3, name: '오후 공원 산책', placeType: 'PARK', startTime: '14:00', endTime: '17:00' } },
  { from: 17, to: 21, emoji: '🍽', theme: { roomThemeId: 4, name: '저녁 식당', placeType: 'RESTAURANT', startTime: '17:00', endTime: '21:00' } },
  { from: 21, to: 24, emoji: '🍷', theme: { roomThemeId: 5, name: '밤 와인바', placeType: 'BAR', startTime: '21:00', endTime: '24:00' } },
  { from: 0, to: 6, emoji: '🌙', theme: { roomThemeId: 6, name: '심야 라운지', placeType: 'LOUNGE', startTime: '00:00', endTime: '06:00' } },
]

/** 이모지 + 테마를 시간대로 뽑는다. 배경/앰비언스가 없는 폴백 테마를 돌려준다. */
export function themeForHour(hour: number): { theme: RoomTheme; emoji: string } {
  const slot = THEME_SLOTS.find((s) => hour >= s.from && hour < s.to) ?? THEME_SLOTS[3]
  return { theme: slot.theme, emoji: slot.emoji }
}

/** placeType → 칩 이모지 (서버 테마에 이모지가 없을 때 표시용). */
export function emojiForPlaceType(placeType: string): string {
  return THEME_SLOTS.find((s) => s.theme.placeType === placeType)?.emoji ?? '📍'
}
