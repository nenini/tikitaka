import { useEffect, useState } from 'react'

/** 1초마다 갱신되는 현재시각(ms). 카운트다운·경과시간 계산용. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** 초 → mm:ss. */
export function formatMMSS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** ISO 시각 → "오늘 19:00" / "내일 09:30" 표기. */
export function formatSessionTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const isSameDay = d.toDateString() === today.toDateString()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const day = isSameDay ? '오늘' : isTomorrow ? '내일' : `${d.getMonth() + 1}.${d.getDate()}`
  return `${day} ${hh}:${mm}`
}

/** ISO 범위 → "오늘 18:00~21:00". */
export function formatTimeRange(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return '미설정'
  const s = new Date(startIso)
  const day = formatSessionTime(startIso).split(' ')[0]
  const t = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return endIso ? `${day} ${t(s)}~${t(new Date(endIso))}` : `${day} ${t(s)}`
}
