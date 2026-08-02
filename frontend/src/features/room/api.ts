import { apiClient } from '@/shared/api/client'
import { errorCodeOf, unwrap } from '@/shared/api/envelope'
import type { ApiEnvelope } from '@/shared/api/envelope'
import { serverDateTimeToIso, serverDateTimeToIsoRequired } from '@/shared/api/datetime'
import { getMyPracticeGoal } from '@/shared/api/me'
import type {
  DeviceCheckPayload,
  RawDeviceCheckResult,
  RawWaitingRoom,
  RoomBundle,
  RoomParticipantsStatus,
  RoomTheme,
} from './types'

/**
 * 대기방 REST.
 *
 * 백엔드 SSOT (`room/api/WaitingRoomController.java`) — `roomId` == `sessionId`.
 *
 *   GET    /api/v1/rooms/{roomId}                      대기방 상세 + 입장 게이트
 *   POST   /api/v1/rooms/{roomId}/device-check         기기 점검 결과 저장 (201)
 *   GET    /api/v1/rooms/{roomId}/device-check         최근 점검 결과
 *   POST   /api/v1/rooms/{roomId}/ready                준비 완료
 *   DELETE /api/v1/rooms/{roomId}/ready                준비 해제
 *   GET    /api/v1/rooms/{roomId}/participants/status  양측 준비 현황
 *
 * 실시간: STOMP `/topic/rooms/{roomId}/participants` (RoomParticipantStatusChangedResponse)
 *
 * ⚠️ 기기 점검은 더 이상 "클라 전용"이 아니다. 서버가 4개 항목을 모두 통과해야
 *    `readyAvailable` 을 주고, ready 없이는 세션을 시작할 수 없다
 *    (`RoomReadyService` → `DEVICE_CHECK_REQUIRED` / `DEVICE_CHECK_FAILED`).
 */

/* ── 대기방 상세 ───────────────────────────────────────── */

/** 대기방 상세 + 시간대 테마 + 내 세션 목표를 한 번에 묶어 돌려준다. */
export async function fetchRoomBundle(roomId: number): Promise<RoomBundle> {
  const [raw, practiceGoal] = await Promise.all([
    apiClient.get<ApiEnvelope<RawWaitingRoom>>(`/v1/rooms/${roomId}`).then(unwrap),
    // 목표를 못 읽어도 대기방은 떠야 한다.
    getMyPracticeGoal().catch(() => null),
  ])

  const scheduledStartAt = serverDateTimeToIsoRequired(raw.scheduledAt)
  const { theme, emoji } = themeForHour(new Date(scheduledStartAt).getHours())

  return {
    roomId: raw.roomId,
    matchPairId: raw.matchPairId,
    status: raw.status,
    scheduledStartAt,
    enterableFrom: serverDateTimeToIso(raw.enterableFrom),
    enterableUntil: serverDateTimeToIso(raw.enterableUntil),
    canEnter: raw.canEnter,
    entryStatus: raw.entryStatus,
    participants: raw.participants ?? [],
    theme,
    themeEmoji: emoji,
    practiceGoal,
  }
}

/* ── 기기 점검 ─────────────────────────────────────────── */

/** 점검 결과 저장. 서버가 `readyAvailable` 을 판정해 돌려준다. */
export async function saveDeviceCheck(
  roomId: number,
  payload: DeviceCheckPayload,
): Promise<RawDeviceCheckResult> {
  return unwrap(
    await apiClient.post<ApiEnvelope<RawDeviceCheckResult>>(
      `/v1/rooms/${roomId}/device-check`,
      payload,
    ),
  )
}

/** 최근 점검 결과. 아직 없으면 null(서버는 404 `DEVICE_CHECK_NOT_FOUND`). */
export async function getLatestDeviceCheck(roomId: number): Promise<RawDeviceCheckResult | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<RawDeviceCheckResult>>(`/v1/rooms/${roomId}/device-check`),
    )
  } catch (error) {
    if (errorCodeOf(error) === 'DEVICE_CHECK_NOT_FOUND') return null
    throw error
  }
}

/* ── 준비 완료 ─────────────────────────────────────────── */

/** 준비 완료. 직전 점검이 전 항목 통과가 아니면 서버가 409 로 막는다. */
export async function markReady(roomId: number): Promise<RoomParticipantsStatus> {
  return unwrap(
    await apiClient.post<ApiEnvelope<RoomParticipantsStatus>>(`/v1/rooms/${roomId}/ready`),
  )
}

export async function cancelReady(roomId: number): Promise<RoomParticipantsStatus> {
  return unwrap(
    await apiClient.delete<ApiEnvelope<RoomParticipantsStatus>>(`/v1/rooms/${roomId}/ready`),
  )
}

export async function getParticipantsStatus(roomId: number): Promise<RoomParticipantsStatus> {
  return unwrap(
    await apiClient.get<ApiEnvelope<RoomParticipantsStatus>>(
      `/v1/rooms/${roomId}/participants/status`,
    ),
  )
}

/* ── 테마 (클라이언트 배정) ────────────────────────────── */

/**
 * 시간대 → 상황 테마 배정 표.
 *
 * ⚠️ 백엔드에 `room_themes` 응답이 없어 **클라이언트가 SSOT** 다(임시).
 *    서버가 테마를 내려주면 이 표는 폴백으로 내려간다.
 */
const THEME_SLOTS: ReadonlyArray<{ from: number; to: number; theme: RoomTheme; emoji: string }> = [
  { from: 6, to: 11, emoji: '☕', theme: { roomThemeId: 1, name: '아침 카페', placeType: 'CAFE', startTime: '06:00', endTime: '11:00' } },
  { from: 11, to: 14, emoji: '🍽', theme: { roomThemeId: 2, name: '점심 식당', placeType: 'RESTAURANT', startTime: '11:00', endTime: '14:00' } },
  { from: 14, to: 17, emoji: '🌳', theme: { roomThemeId: 3, name: '오후 공원 산책', placeType: 'PARK', startTime: '14:00', endTime: '17:00' } },
  { from: 17, to: 21, emoji: '🍽', theme: { roomThemeId: 4, name: '저녁 식당', placeType: 'RESTAURANT', startTime: '17:00', endTime: '21:00' } },
  { from: 21, to: 24, emoji: '🍷', theme: { roomThemeId: 5, name: '밤 와인바', placeType: 'BAR', startTime: '21:00', endTime: '24:00' } },
  { from: 0, to: 6, emoji: '🌙', theme: { roomThemeId: 6, name: '심야 라운지', placeType: 'LOUNGE', startTime: '00:00', endTime: '06:00' } },
]

/** 이모지 + 테마를 시간대로 뽑는다. */
export function themeForHour(hour: number): { theme: RoomTheme; emoji: string } {
  const slot = THEME_SLOTS.find((s) => hour >= s.from && hour < s.to) ?? THEME_SLOTS[3]
  return { theme: slot.theme, emoji: slot.emoji }
}

/** placeType → 칩 이모지. */
export function emojiForPlaceType(placeType: string): string {
  return THEME_SLOTS.find((s) => s.theme.placeType === placeType)?.emoji ?? '📍'
}
