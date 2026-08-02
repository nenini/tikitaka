/**
 * 서버 시각 ↔ 브라우저 Date 변환.
 *
 * 백엔드는 `LocalDateTime` 을 **타임존 없이** 직렬화한다(`2026-07-30T19:00:00`).
 * 서비스 기준 타임존은 `Asia/Seoul` 로 고정돼 있다
 * (SSOT: `MatchRequestService.SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul")`).
 *
 * 브라우저에서 `new Date('2026-07-30T19:00:00')` 은 **로컬 타임존**으로 해석되므로,
 * 사용자 기기가 KST 가 아니면 카운트다운이 그대로 어긋난다. 그래서 파싱을 여기 한 곳에 모아
 * 항상 +09:00 로 못박는다.
 */

/** 서버 기준 타임존 오프셋(분). Asia/Seoul 은 DST 가 없어 상수로 충분하다. */
const SERVER_UTC_OFFSET_MINUTES = 9 * 60

/** 이미 타임존 정보가 붙어 있는 문자열인지(Z 또는 ±HH:mm). */
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/

const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,9}))?$/

/**
 * 서버 `LocalDateTime` 문자열 → Date.
 * 타임존이 붙어 있으면 그대로 신뢰하고, 없으면 KST 로 해석한다.
 */
export function parseServerDateTime(value: string | null | undefined): Date | null {
  if (!value) return null

  if (HAS_ZONE.test(value)) {
    const withZone = new Date(value)
    return Number.isNaN(withZone.getTime()) ? null : withZone
  }

  const parts = LOCAL_DATE_TIME.exec(value)
  if (!parts) {
    const loose = new Date(value)
    return Number.isNaN(loose.getTime()) ? null : loose
  }

  const [, y, mo, d, h, mi, s, frac] = parts
  // 밀리초는 앞 3자리만 쓴다(서버가 나노초까지 보낼 수 있다).
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0), ms)
  return new Date(asUtc - SERVER_UTC_OFFSET_MINUTES * 60_000)
}

/**
 * 서버 `LocalDateTime` 문자열 → 표준 ISO 문자열(UTC, `Z` 포함).
 *
 * 화면 컴포넌트들은 ISO 문자열을 받아 `new Date(iso)` 로 쓰도록 만들어져 있다.
 * api 레이어에서 이 함수로 한 번 정규화해두면 화면 코드는 손대지 않아도 된다.
 */
export function serverDateTimeToIso(value: string | null | undefined): string | null {
  return parseServerDateTime(value)?.toISOString() ?? null
}

/** null 을 허용하지 않는 자리에 쓰는 버전. 파싱 실패 시 현재 시각으로 대체한다. */
export function serverDateTimeToIsoRequired(value: string | null | undefined): string {
  return serverDateTimeToIso(value) ?? new Date().toISOString()
}

/**
 * Date → 서버 `LocalDateTime` 문자열(`yyyy-MM-ddTHH:mm:ss`, KST 기준).
 * 서버가 `LocalDateTime` 을 받는 요청 바디에 쓴다.
 */
export function toServerDateTime(date: Date): string {
  const shifted = new Date(date.getTime() + SERVER_UTC_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(0, 19)
}

/** `LocalTime` 문자열(`HH:mm[:ss]`) → `HH:mm`. 화면 표시용. */
export function formatServerTime(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}
