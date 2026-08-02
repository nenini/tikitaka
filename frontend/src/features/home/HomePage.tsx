import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardButton,
  CardHeader,
  EmptyState,
  Icon,
  ListRow,
  TagChip,
} from '@/components'
import { useAuthStore } from '@/stores/auth.store'

/* -------------------------------------------------------------------------- */
/*  W-08 · 메인 홈 (대시보드)                                                   */
/*  1차 확정 옵션:                                                             */
/*   ① 상단 네비 = 공유 AppShell 로 분리(홈은 콘텐츠만)                          */
/*   ② 사랑의 온도 = 가로 미터바   ③ 예정세션 없음 = EmptyState+CTA             */
/*   ④ AI 바로연습 = CardButton 2개  ⑤ 2단 카드 + 모바일 자동 1단(반응형)        */
/*  - 데이터는 데모 고정(백엔드 수정 중). API 자리는 TODO 로 표시.               */
/* -------------------------------------------------------------------------- */

/** 데모 예정 세션. null 이면 EmptyState 분기. TODO(HOME): GET /api/v1/sessions/upcoming */
const UPCOMING: {
  partnerName: string
  age: string
  height: string
  face: string
  when: string
  startsIn: string
} | null = {
  partnerName: '유월',
  age: '20대 후반',
  height: '167cm',
  face: '🐰 토끼상 · 차분한 인상',
  when: '오늘 19:00 · 저녁 식당 테마',
  startsIn: '2시간 12분 뒤',
}

/** 사랑의 온도 미터바. 36.5 기준, 30~42 범위를 게이지로. (전용 컴포넌트 없어 페이지 로컬) */
function LoveTemperatureMeter({ value, delta }: { value: number; delta: number }) {
  const pct = Math.max(0, Math.min(100, ((value - 30) / (42 - 30)) * 100))
  return (
    <div>
      <div className="flex items-end gap-2">
        <span className="bt-numeric text-[32px] font-extrabold leading-none tracking-[-0.02em] text-brand">
          {value.toFixed(1)}
          <span className="text-[18px]">°</span>
        </span>
        <Badge tone="success">▲ {delta.toFixed(1)}</Badge>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={30}
        aria-valuemax={42}
        aria-label={`사랑의 온도 ${value.toFixed(1)}도`}
      >
        <div
          className="h-full rounded-full"
          style={
            {
              width: `${pct}%`,
              background: 'linear-gradient(90deg, var(--bt-pollen-500), var(--bt-rose-500))',
            } as CSSProperties
          }
        />
      </div>
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 pt-6 sm:px-6">
      {/* ── 인사줄 ─────────────────────────────────────────── */}
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="bt-h2">오늘도 한 걸음, 연습해볼까요?</h1>
          <p className="bt-body-sm bt-muted mt-1">
            {user ? `${user.nickname} 님 · ` : ''}이번 주 예정 세션 1개 · 완료한 연습 7회
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="success">● 매칭 가능</Badge>
          {/* 상단 빠른 진입 — 아래 '연습 시작' 카드의 매칭 신청과 상호 보완 */}
          <Button variant="primary" size="sm" onClick={() => navigate('/matching')}>
            새 매칭 시작
          </Button>
        </div>
      </header>

      {/* ── 상단 밴드: 사랑의 온도 + 예정된 세션 ───────────────── */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        <Card>
          <CardHeader title="사랑의 온도" />
          <LoveTemperatureMeter value={38.2} delta={1.7} />
          <p className="bt-caption mt-2">최근 세션 이후 상승. 상대에게 정확한 온도는 공개되지 않아요.</p>
          <div className="mt-3 flex gap-7">
            {[
              { v: 7, k: '완료 세션' },
              { v: 0, k: '노쇼' },
            ].map((s) => (
              <div key={s.k} className="flex flex-col gap-0.5">
                <span className="bt-numeric text-[22px] font-extrabold">{s.v}</span>
                <span className="bt-caption">{s.k}</span>
              </div>
            ))}
          </div>
        </Card>

        {UPCOMING ? (
          <Card>
            <div className="flex items-center justify-between">
              <CardHeader title="예정된 세션" />
              <Badge tone="warning">{UPCOMING.startsIn}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <Avatar size="md" name={UPCOMING.partnerName} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="text-[15px]">{UPCOMING.partnerName}</b>
                  <TagChip>{UPCOMING.age}</TagChip>
                  <TagChip>{UPCOMING.height}</TagChip>
                </div>
                <p className="bt-caption mt-0.5">
                  {UPCOMING.face} · {UPCOMING.when}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate('/session/demo')}>
                상세
              </Button>
            </div>
            <Callout tone="info">
              <b>시작 1시간 전까지</b> 취소하면 패널티가 없어요. 이후 취소는 온도 감소 + 노쇼 1회.
            </Callout>
            <div className="flex gap-2">
              <Button variant="primary" block onClick={() => navigate('/session/demo')}>
                대기방 입장
              </Button>
              <Button variant="secondary" onClick={() => console.log('TODO(HOME): 일정 취소')}>
                일정 취소
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="flex items-center justify-center">
            <EmptyState
              icon={<Icon name="clock" size={30} />}
              title="예정된 세션이 없어요"
              text="새 매칭을 시작하면 여기에 표시돼요."
              action={
                <Button variant="primary" size="sm" onClick={() => navigate('/matching')}>
                  새 매칭 시작
                </Button>
              }
            />
          </Card>
        )}
      </div>

      {/* ── 액션 밴드: 연습 시작(2파트) + 최근 리포트 ─────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* 연습 시작 — 한 카드 너비 안에서 실사용자 매칭 / AI 바로연습 2파트 */}
        <Card>
          <CardHeader title="연습 시작" />

          {/* 파트① 실사용자 매칭 (비동기 · 대기 큐) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">🧑</span>
              <b className="text-[14px]">실사용자 매칭</b>
              <Badge tone="success" className="ml-auto">
                ● 매칭 가능
              </Badge>
            </div>
            <p className="bt-caption">
              30분 세션 · 신청하면 <b className="text-ink">대기 큐 등록</b> → 매칭 시 알림 (예상 ~4분)
            </p>
            <Button
              variant="primary"
              size="sm"
              className="self-start"
              onClick={() => navigate('/matching')}
            >
              매칭 신청
            </Button>
          </div>

          <div className="my-3 h-px bg-[var(--bt-color-border)]" />

          {/* 파트② AI 바로 연습 (즉시) — CardButton 2개 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">⚡</span>
              <b className="text-[14px]">바로 연습</b>
              <Badge tone="neutral" className="ml-auto">
                대기 없음
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* TODO(HOME): AI 화상(W-21) 화면 생기면 /ai-video/setup 으로 연결 */}
              <CardButton onClick={() => console.log('TODO(HOME): AI 화상 15분 시작')}>
                <span className="mb-1 block text-[20px]" aria-hidden="true">
                  🤖
                </span>
                <span className="text-[13px] font-semibold">AI 화상 15분</span>
              </CardButton>
              {/* 챗봇 F5 진입점 — 페르소나 설정(W-10)부터 시작한다.
                  매칭 트랙 선택·대기 큐 화면과 같은 경로를 쓴다. */}
              <CardButton onClick={() => navigate('/chatbot/persona')}>
                <span className="mb-1 block text-[20px]" aria-hidden="true">
                  💬
                </span>
                <span className="text-[13px] font-semibold">AI 챗봇</span>
              </CardButton>
            </div>
            <p className="bt-caption">지금 바로 시작 · AI 분석 단독 · 상대 평가 없음</p>
          </div>
        </Card>

        {/* 최근 리포트 */}
        <Card>
          <CardHeader title="최근 리포트" />
          <div>
            <ListRow
              leading={<Avatar size="sm" name="서준" />}
              title="6회차 · 서준"
              meta="대화 흐름 4.2 · 경청 4.5"
              trailing={<span className="bt-caption">2일 전</span>}
            />
            <ListRow
              leading={<Avatar size="sm" name="AI" fallback="🤖" />}
              title="AI 화상 연습"
              meta="AI 분석 단독 · 상대 평가 없음"
              trailing={<span className="bt-caption">4일 전</span>}
            />
          </div>
        </Card>
      </div>
    </main>
  )
}
