/**
 * 마감 시각 표기. 남은 시간이 짧으면 "N시간 뒤", 하루 이상이면 "7.30 19:00" 로 적는다.
 * 48h 게이트는 초 단위 카운트다운이 필요 없어서 1초 타이머를 두지 않는다.
 *
 * 남은 시간은 반드시 **서버가 준 `remainingSeconds`** 로 잰다.
 * `deadlineAt` 은 오프셋 없는 `LocalDateTime` 이라 브라우저가 로컬 시각으로 해석하는데,
 * 사용자 시간대가 서버와 다르면 몇 시간씩 어긋난다. 절대 시각 표기에만 쓴다.
 */
export function formatDeadline(deadlineAt: string, remainingSeconds: number): string {
  if (remainingSeconds <= 0) return '마감'

  const hours = Math.floor(remainingSeconds / 3600)
  if (hours < 24) {
    return hours >= 1 ? `${hours}시간 뒤` : `${Math.max(1, Math.floor(remainingSeconds / 60))}분 뒤`
  }

  const d = new Date(deadlineAt)
  if (Number.isNaN(d.getTime())) return `${Math.floor(hours / 24)}일 뒤`
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}.${d.getDate()} ${hh}:${mm}`
}
