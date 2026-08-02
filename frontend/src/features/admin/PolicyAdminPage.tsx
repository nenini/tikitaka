import { useState } from 'react'
import { Badge, Button, Callout, Card, CardHeader, Progress, Segmented } from '@/components'

/* W-42 · 정책 설정. 데이터 데모 고정. ⑤ 저장 = 상단 단일 '변경 사항 저장'.
   TODO(ADMIN): GET/PUT /api/v1/admin/policy */

const WEIGHTS = [
  { label: '연습 목표 유사도', pct: 30 },
  { label: '대화 성향 보완성', pct: 25 },
  { label: '관심사 유사도', pct: 20 },
  { label: '일정 적합도', pct: 15 },
  { label: '선호 분위기 적합도', pct: 10 },
]

const BACKGROUNDS = [
  { time: '11:00–12:00', theme: '☕ 카페', on: true },
  { time: '12:00–13:00', theme: '🍽 점심 식당', on: true },
  { time: '18:00–19:00', theme: '🍽 저녁 식당', on: true },
  { time: '21:00–', theme: '🌙 야간 라운지', on: false },
]

const PRESETS = ['얼굴상 태그 12종', '연예인 예시 34명', '질문 풀 86개', '부적절 표현 사전 240어']

/** 읽기 전용 정책 필드 표시 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <label className="bt-caption">{label}</label>
      <div className="mt-1 rounded-lg border border-[var(--bt-color-border)] px-3 py-2 text-sm">{value}</div>
    </div>
  )
}

export function PolicyAdminPage() {
  const [coachInterval, setCoachInterval] = useState<'10' | '5' | '3'>('5')

  return (
    <main className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="bt-h2">정책 설정</h1>
        {/* ⑤ 상단 단일 저장 */}
        <Button variant="primary" size="sm" onClick={() => console.log('TODO(ADMIN): 정책 저장')}>
          변경 사항 저장
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* 좌 열 */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="매칭 점수 가중치" />
            <div className="mt-1 flex flex-col gap-3">
              {WEIGHTS.map((w) => (
                <div key={w.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="bt-muted">{w.label}</span>
                    <b className="bt-numeric">{w.pct}%</b>
                  </div>
                  <Progress value={w.pct} aria-label={`${w.label} ${w.pct}%`} />
                </div>
              ))}
            </div>
            <Callout tone="warning" className="mt-2">
              <b>관심사 유사도 20%는 현재 입력 데이터가 없습니다</b> — PROFILE-04가 P2로 내려가 산출 불가. 가중치 재분배 필요(D-01).
            </Callout>
          </Card>

          <Card>
            <CardHeader title="노쇼 · 취소 패널티" />
            <div className="mt-1 flex flex-col gap-3 sm:flex-row">
              <Field label="대기 허용 시간" value="5분" />
              <Field label="패널티 소멸 주기" value="6개월" />
              <Field label="취소 패널티 기준" value="세션 1시간 전" />
            </div>
          </Card>
        </div>

        {/* 우 열 */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="AI 코칭 정책" />
            <div className="mt-1 flex flex-col gap-3">
              <div>
                <label className="bt-caption">코칭 개입 주기</label>
                <div className="mt-1">
                  <Segmented
                    aria-label="코칭 개입 주기"
                    value={coachInterval}
                    onChange={setCoachInterval}
                    options={[
                      { value: '10', label: '10분' },
                      { value: '5', label: '5분' },
                      { value: '3', label: '3분' },
                    ]}
                  />
                </div>
              </div>
              <Field label="침묵 개입 임계값 (초)" value="10 / 15 / 30 / 45" />
              <p className="bt-caption">0–10초 개입 없음 · 15–20초 주제 버튼 · 30초 질문 카드 · 45초+ 맥락 기반</p>
              <Field label="분석 모델 버전" value="face-landmarker v1.2 · stt-stream v0.9" />
            </div>
          </Card>

          <Card>
            <CardHeader title="상황형 배경 (시간대별 자동 배정)" />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bt-caption text-left [&>th]:border-b [&>th]:border-[var(--bt-color-border)] [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold">
                    <th>시간대</th>
                    <th>테마</th>
                    <th>환경음</th>
                  </tr>
                </thead>
                <tbody>
                  {BACKGROUNDS.map((b) => (
                    <tr key={b.time} className="[&>td]:border-b [&>td]:border-[var(--bt-color-border)] [&>td]:px-2 [&>td]:py-2.5">
                      <td className="bt-numeric bt-muted">{b.time}</td>
                      <td>{b.theme}</td>
                      <td><Badge tone={b.on ? 'success' : 'neutral'}>{b.on ? 'ON' : 'OFF'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="사전 데이터" />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <span key={p} className="bt-caption rounded-full border border-[var(--bt-color-border)] px-3 py-1">
                  {p}
                </span>
              ))}
            </div>
            <Callout tone="warning" className="mt-2">
              질문 풀의 <b>'종교'</b> 주제가 민감 주제와 충돌 — D-11 검토 필요
            </Callout>
          </Card>
        </div>
      </div>
    </main>
  )
}
