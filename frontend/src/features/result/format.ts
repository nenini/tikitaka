/**
 * 마감 시각 표기. 남은 시간이 짧으면 "N시간 뒤", 하루 이상이면 "7.30 19:00" 로 적는다.
 * 48h 게이트는 초 단위 카운트다운이 필요 없어서 1초 타이머를 두지 않는다.
 */
export function formatDeadline(iso: string): string {
  const target = new Date(iso).getTime()
  const remainMs = target - Date.now()
  if (remainMs <= 0) return '마감'

  const hours = Math.floor(remainMs / 3600_000)
  if (hours < 24) {
    return hours >= 1 ? `${hours}시간 뒤` : `${Math.max(1, Math.floor(remainMs / 60_000))}분 뒤`
  }

  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}.${d.getDate()} ${hh}:${mm}`
}
