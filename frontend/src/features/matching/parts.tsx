import type { ReactNode } from 'react'

/** 라벨-값 정보 행 (목업의 .lrow). 좌측 라벨 muted, 우측 값. */
export function InfoRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="bt-body-sm bt-muted shrink-0">{label}</span>
      <span className="bt-body-sm text-right font-medium">{value}</span>
    </div>
  )
}
