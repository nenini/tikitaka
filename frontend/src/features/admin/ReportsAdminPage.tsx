import { useState } from 'react'
import { Badge, Button, Callout, Card, CardHeader, Chip } from '@/components'
import type { BadgeTone } from '@/components'

/* W-41 · 신고 관리 (마스터-디테일). 데이터 데모 고정.
   TODO(ADMIN): GET /api/v1/admin/reports , PATCH /api/v1/admin/reports/{id}/sanction */

type Status = '접수' | '검토 중' | '완료'

interface Report {
  id: string
  type: string
  typeTone: BadgeTone
  severe: boolean
  reporter: string
  target: string
  targetHistory: string
  session: string
  status: Status
  statusTone: BadgeTone
  at: string
  reporterNote: string
}

const REPORTS: Report[] = [
  { id: '#2041', type: '성적 발언', typeTone: 'danger', severe: true, reporter: 'user_2204', target: 'user_8812', targetHistory: '누적 신고 2회', session: 'S-8871 · 신고 즉시 종료됨', status: '검토 중', statusTone: 'warning', at: '10분 전', reporterNote: '대화 중 반복적으로 불쾌한 질문을 했습니다…' },
  { id: '#2040', type: '욕설·비하', typeTone: 'danger', severe: true, reporter: 'user_1190', target: 'user_7734', targetHistory: '누적 신고 1회', session: 'S-8869', status: '접수', statusTone: 'neutral', at: '42분 전', reporterNote: '반말과 비하 발언이 있었습니다.' },
  { id: '#2039', type: '개인정보 요구', typeTone: 'neutral', severe: false, reporter: 'user_3312', target: 'user_9120', targetHistory: '누적 신고 0회', session: 'S-8865', status: '접수', statusTone: 'neutral', at: '2시간 전', reporterNote: '전화번호를 알려달라고 요구했습니다.' },
  { id: '#2038', type: '기타', typeTone: 'neutral', severe: false, reporter: 'user_5540', target: 'user_4471', targetHistory: '누적 신고 0회', session: 'S-8860', status: '완료', statusTone: 'success', at: '5시간 전', reporterNote: '연결 상태가 불안정했습니다.' },
]

const FILTERS = ['전체', '접수', '검토 중', '완료'] as const
type Filter = (typeof FILTERS)[number]

const SANCTIONS = ['주의', '매칭 제한 7일', '서비스 정지 30일', '영구 이용 제한'] as const
type Sanction = (typeof SANCTIONS)[number]

/** label — value 상세 행 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[var(--bt-color-border)] py-2 text-sm first:border-t-0">
      <span className="bt-muted shrink-0">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export function ReportsAdminPage() {
  const [filter, setFilter] = useState<Filter>('전체')
  const [selectedId, setSelectedId] = useState<string>(REPORTS[0].id)
  const [sanction, setSanction] = useState<Sanction>('매칭 제한 7일')

  const visible = filter === '전체' ? REPORTS : REPORTS.filter((r) => r.status === filter)
  const selected = REPORTS.find((r) => r.id === selectedId) ?? null

  const counts: Record<Filter, number> = {
    전체: REPORTS.length,
    접수: REPORTS.filter((r) => r.status === '접수').length,
    '검토 중': REPORTS.filter((r) => r.status === '검토 중').length,
    완료: REPORTS.filter((r) => r.status === '완료').length,
  }

  return (
    <main className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="bt-h2">신고 관리</h1>
        {/* ④ 상태 필터 = 칩 */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Chip key={f} selected={filter === f} onSelectedChange={() => setFilter(f)}>
              {f} {counts[f]}
            </Chip>
          ))}
        </div>
      </div>

      {/* ③ 마스터-디테일: 좌 목록 / 우 상세·제재 */}
      <div className="grid gap-4 lg:grid-cols-[1fr_400px] lg:items-start">
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bt-caption text-left [&>th]:border-b [&>th]:border-[var(--bt-color-border)] [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-semibold">
                  <th>ID</th>
                  <th>유형</th>
                  <th>피신고자</th>
                  <th>세션</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    aria-selected={selectedId === r.id}
                    className={`cursor-pointer [&>td]:border-b [&>td]:border-[var(--bt-color-border)] [&>td]:px-3 [&>td]:py-3 ${
                      selectedId === r.id ? 'bg-[var(--bt-color-action-subtle)]' : 'hover:bg-surface-sunken'
                    }`}
                  >
                    <td className="bt-numeric">{r.id}</td>
                    <td><Badge tone={r.typeTone}>{r.type}</Badge></td>
                    <td className="bt-numeric">{r.target}</td>
                    <td className="bt-numeric bt-muted">{r.session.split(' ')[0]}</td>
                    <td><Badge tone={r.statusTone}>{r.status}</Badge></td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="bt-muted px-3 py-8 text-center text-sm">
                      해당 상태의 신고가 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 우측 디테일 패널 — 선택된 신고에 동기화 */}
        <div className="flex flex-col gap-4">
          {selected ? (
            <>
              <Card>
                <div className="flex items-center justify-between">
                  <b className="text-[15px]">{selected.id} 상세</b>
                  {selected.severe && <Badge tone="danger">심각 유형</Badge>}
                </div>
                <div className="mt-1">
                  <Row label="유형" value={selected.type} />
                  <Row label="신고자" value={selected.reporter} />
                  <Row label="피신고자" value={`${selected.target} · ${selected.targetHistory}`} />
                  <Row label="세션" value={selected.session} />
                </div>
                <div className="mt-1">
                  <p className="bt-caption font-bold">신고자 설명</p>
                  <p className="bt-body-sm mt-1 rounded-lg bg-surface-sunken p-2">{selected.reporterNote}</p>
                </div>
                <div className="mt-1">
                  <p className="bt-caption font-bold">자동 감지 기록 (참고 · 별도 경로)</p>
                  <p className="bt-caption mt-0.5">SAFETY-01 룰 감지 3건 · 12:04 / 18:22 / 24:51</p>
                </div>
              </Card>

              <Card>
                <CardHeader title="제재 적용" />
                <div role="radiogroup" aria-label="제재 수위" className="flex flex-col gap-1.5">
                  {SANCTIONS.map((s) => {
                    const on = sanction === s
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setSanction(s)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          on ? 'border-brand bg-[var(--bt-color-action-subtle)] font-semibold text-link' : 'border-[var(--bt-color-border)] hover:border-[var(--bt-color-action)]'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${on ? 'border-brand bg-brand' : 'border-[var(--bt-color-muted,#7a7176)]'}`}
                          aria-hidden="true"
                        />
                        {s}
                      </button>
                    )
                  })}
                </div>
                <Callout tone="warning" className="mt-2">
                  <b>AI 감지 결과만으로 영구 정지 금지.</b> 단계적 제재를 우선 검토하세요.
                </Callout>
                <div className="flex gap-2">
                  <Button variant="secondary" block onClick={() => console.log('TODO(ADMIN): 반려', selected.id)}>
                    반려
                  </Button>
                  <Button variant="primary" block onClick={() => console.log('TODO(ADMIN): 제재 적용', selected.id, sanction)}>
                    제재 적용
                  </Button>
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <p className="bt-body-sm bt-muted py-8 text-center">표에서 신고를 선택하면 상세·제재가 표시돼요.</p>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
