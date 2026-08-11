/** 챗봇 대화 화면의 시각 표기. 숫자는 `.bt-numeric` 과 함께 쓴다. */

const TIME_FMT = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const DAY_FMT = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

/** "14:02" */
export function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}

/** 오늘/어제/그 외 날짜. 대화 흐름의 날짜 구분선에 쓴다. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (isSameDay(d, today)) return '오늘'
  if (isSameDay(d, yesterday)) return '어제'
  return DAY_FMT.format(d)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

/** 두 ISO 시각이 다른 날이면 true — 날짜 구분선을 넣을 자리. */
export function needsDayDivider(prevIso: string | undefined, iso: string): boolean {
  if (!prevIso) return true
  return !isSameDay(new Date(prevIso), new Date(iso))
}
