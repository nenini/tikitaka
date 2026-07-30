import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Badge, Button, Callout, Card, CardHeader } from '@/components'
import type { BadgeTone } from '@/components'

/* W-40 · 관리자 운영 대시보드. 데이터 데모 고정. TODO(ADMIN): GET /api/v1/admin/dashboard */

function Stat({ label, value, tone, delta }: { label: string; value: string; tone?: BadgeTone; delta?: string }) {
  return (
    <Card className="min-w-[150px] flex-1">
      <CardHeader title={label} />
      <div className="flex items-end gap-2">
        <span className="bt-numeric text-[26px] font-extrabold tracking-[-0.02em]">{value}</span>
        {delta && <Badge tone={tone ?? 'neutral'}>{delta}</Badge>}
      </div>
    </Card>
  )
}

const RECENT = [
  { id: '#2041', type: '성적 발언', typeTone: 'danger' as BadgeTone, target: 'user_8812', at: '10분 전', status: '검토 중', statusTone: 'warning' as BadgeTone },
  { id: '#2040', type: '욕설·비하', typeTone: 'danger' as BadgeTone, target: 'user_7734', at: '42분 전', status: '접수', statusTone: 'neutral' as BadgeTone },
  { id: '#2039', type: '개인정보 요구', typeTone: 'neutral' as BadgeTone, target: 'user_9120', at: '2시간 전', status: '접수', statusTone: 'neutral' as BadgeTone },
  { id: '#2038', type: '기타', typeTone: 'neutral' as BadgeTone, target: 'user_4471', at: '5시간 전', status: '처리 완료', statusTone: 'success' as BadgeTone },
]

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="bt-muted">{label}</span>
      <b className="bt-numeric">{value}</b>
    </div>
  )
}

export function AdminDashboardPage() {
  const navigate = useNavigate()
  return (
    <main className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="bt-h2">운영 대시보드</h1>
        <Badge tone="neutral">2026-07-21 기준</Badge>
      </div>

      {/* 통계 4카드 */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Stat label="신규 가입" value="34" tone="success" delta="▲ 12%" />
        <Stat label="진행 중 세션" value="7" delta="실시간" />
        <Stat label="미처리 신고" value="5" tone="danger" delta="▲ 2" />
        <Stat label="오늘 노쇼율" value="4.2%" tone="success" delta="▼ 0.8%p" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* 최근 신고 */}
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <CardHeader title="최근 신고" />
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/reports')}>
              전체 보기
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bt-caption text-left [&>th]:border-b [&>th]:border-[var(--bt-color-border)] [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold">
                  <th>ID</th>
                  <th>유형</th>
                  <th>피신고자</th>
                  <th>접수</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {RECENT.map((r) => (
                  <tr key={r.id} className="[&>td]:border-b [&>td]:border-[var(--bt-color-border)] [&>td]:px-2 [&>td]:py-2.5">
                    <td className="bt-numeric">{r.id}</td>
                    <td><Badge tone={r.typeTone}>{r.type}</Badge></td>
                    <td className="bt-numeric">{r.target}</td>
                    <td className="bt-numeric bt-muted">{r.at}</td>
                    <td><Badge tone={r.statusTone}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 세션 지표 · 자동 감지 */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="세션 지표 (오늘)" />
            <div className="mt-1">
              <Metric label="예정" value="18" />
              <Metric label="완료" value="11" />
              <Metric label="취소" value="2" />
              <Metric label="WebRTC 연결 실패" value="1" />
            </div>
          </Card>
          <Card>
            <CardHeader title="자동 감지 (신고와 분리)" />
            <div className="mt-1">
              <Metric label="룰 기반 감지" value="23" />
              <Metric label="LLM 분류" value="9" />
            </div>
            <Callout tone="warning" className="mt-2">
              자동 감지만으로 <b>계정 정지 불가</b> — 운영자 검토 필수
            </Callout>
          </Card>
        </div>
      </div>
    </main>
  )
}
