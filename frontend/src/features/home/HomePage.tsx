import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  ListRow,
  Stack,
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

/**
 * 데모 예정 세션. null 이면 EmptyState 분기. TODO(HOME): GET /api/v1/sessions/upcoming
 *
 * ⚠️ 키(cm)는 넣지 않는다. **수집하지 않기로 확정된 항목**이라
 *    (`ProfilePage` W-04 확정 옵션 ②, D-08) 서버 `PublicProfileResponse` 에도 필드가 없다.
 *    데모 데이터에만 있으면 영영 채워지지 않는 칸이 화면에 남는다.
 */
const UPCOMING: {
  partnerName: string
  age: string
  face: string
  when: string
  startsIn: string
} | null = {
  partnerName: '유월',
  age: '20대 후반',
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

  // pb-10: AppShell 이 주는 하단 여백은 모바일 네비 높이(pb-[76px])뿐이고 `md:pb-0` 이라
  // 데스크탑에서는 0 이 된다. 마지막 카드가 뷰포트 바닥에 붙지 않도록 홈에서 직접 준다.
  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 pb-10 pt-6 sm:px-6">
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
          {/* 상단 빠른 진입 — 아래 '연습 시작' 카드의 매칭 신청과 상호 보완.
              size 를 지정하지 않아 기본 md(44px · 좌우 24px · 16px)를 쓴다. 왼쪽 제목+부제 블록이
              약 59px 이라 44px 버튼이 그 안에 들어가므로, 인사줄 높이는 그대로 두고 버튼만 커진다.
              (sm=36px 는 이 줄에서 혼자 작아 보여 주 동작으로 읽히지 않았다.) */}
          <Button variant="primary" onClick={() => navigate('/matching')}>
            새 매칭 시작
          </Button>
        </div>
      </header>

      {/* ── 상단 밴드: 사랑의 온도 + 예정된 세션 ───────────────────── */}
      {/* 두 밴드 모두 같은 규칙을 쓴다 — 사이드 340px, gap 20px, 행 최소 높이 290px.
          `items-start` 를 쓰지 않는다: 기본값 stretch 로 두면 같은 행의 카드 높이가 저절로
          같아져, 카드마다 h-[…] 를 박고 내용이 바뀔 때마다 다시 재는 일을 안 해도 된다.
          290px 은 nav 56 + 본문 여백을 뺀 뒤 두 밴드가 800px 뷰포트 안에 들어가도록 잡은 값이다
          (56 + 24 + 76 + 290 + 20 + 290 + 40 = 796). 이 숫자를 키우면 스크롤이 생긴다. */}
      <div className="grid gap-5 lg:min-h-[290px] lg:grid-cols-[340px_minmax(0,1fr)]">
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
            {/* `.bt-card` 에는 gap 이 없어 자식들이 그대로 붙는다. 자식마다 mt-* 를 다는 대신
                Stack 으로 세로 리듬을 한 번에 준다 — 옆 카드와도 간격이 맞는다. */}
            <Stack gap={12}>
              <div className="flex items-center justify-between gap-2">
                <CardHeader title="예정된 세션" />
                <Badge tone="warning" className="shrink-0">
                  {UPCOMING.startsIn}
                </Badge>
              </div>

              {/* items-start: 이름·태그가 줄바꿈돼도 아바타와 '상세' 가 위에 정렬돼 있어야
                  행 높이가 튀지 않는다. 버튼은 shrink-0 으로 텍스트에 밀리지 않게 고정한다. */}
              <div className="flex items-start gap-3">
                <Avatar size="md" name={UPCOMING.partnerName} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="text-[15px]">{UPCOMING.partnerName}</b>
                    <TagChip>{UPCOMING.age}</TagChip>
                  </div>
                  <p className="bt-caption mt-1">
                    {UPCOMING.face} · {UPCOMING.when}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => navigate('/session/demo')}
                >
                  상세
                </Button>
              </div>

              <Callout tone="info">
                <b>시작 1시간 전까지</b> 취소하면 패널티가 없어요. 이후 취소는 온도 감소 + 노쇼 1회.
              </Callout>

              {/* 모바일은 세로로 쌓는다 — 한 줄에 두면 '일정 취소' 가 눌려 글자가 깨진다.
                  주 동작(대기방 입장)을 위에 둬 엄지에서 먼 쪽이 파괴적 동작이 되지 않게 한다.
                  ⚠️ `block` 프로퍼티(`width:100%`)를 쓰지 않는다 — 가로 배치에서 두 번째 버튼이
                     100% 를 요구해 행을 밀어낸다. 폭은 유틸리티로 브레이크포인트마다 정한다. */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="primary"
                  className="w-full sm:w-auto sm:flex-1"
                  onClick={() => navigate('/session/demo')}
                >
                  대기방 입장
                </Button>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => console.log('TODO(HOME): 일정 취소')}
                >
                  일정 취소
                </Button>
              </div>
            </Stack>
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

      {/* ── 하단 밴드: 연습 시작 + 최근 리포트 ───────────────────── */}
      {/* 사이드 레일이 위 밴드와 반대쪽(우측)에 온다. 폭이 같은 340px 이라 좌우 대칭으로 읽히고,
          '예정된 세션'·'연습 시작' 처럼 내용이 많은 카드가 늘 넓은 쪽을 쓴다. */}
      <div className="mt-5 grid gap-5 lg:min-h-[290px] lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 연습 시작 — 실사용자 매칭 / 바로 연습 2파트.
            두 파트 모두 `설명 좌 · 액션 우` 한 줄로 눕힌다. 세로로 쌓으면 파트당 3줄이 되어
            카드가 행 높이 290px 을 넘고, 그만큼 첫 화면이 밀려 스크롤이 생긴다.
            좁은 화면(sm 미만)에서는 버튼이 눌려 글자가 깨지므로 그때만 세로로 되돌린다. */}
        <Card>
          <CardHeader title="연습 시작" />
          <Stack gap={16}>
            {/* 파트① 실사용자 매칭 (비동기 · 대기 큐) */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true">🧑</span>
                  <b className="text-[14px]">실사용자 매칭</b>
                  <Badge tone="success">● 매칭 가능</Badge>
                </div>
                <p className="bt-caption mt-1">
                  30분 세션 · 신청하면 <b className="text-ink">대기 큐 등록</b> → 매칭 시 알림 (예상 ~4분)
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="shrink-0 self-start sm:self-center"
                onClick={() => navigate('/matching')}
              >
                매칭 신청
              </Button>
            </div>

            <div className="h-px bg-[var(--bt-color-border)]" />

            {/* 파트② AI 바로 연습 (즉시).
                CardButton(세로 아이콘+라벨) 대신 Button 을 쓴다 — `.bt-card` 패딩이 24px 라
                한 줄에 눕히면 버튼 하나가 70px 를 넘어 이 카드만 리듬에서 튄다. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true">⚡</span>
                  <b className="text-[14px]">바로 연습</b>
                  <Badge tone="neutral">대기 없음</Badge>
                </div>
                <p className="bt-caption mt-1">지금 바로 시작 · AI 분석 단독 · 상대 평가 없음</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {/* TODO(HOME): AI 화상(W-21) 화면 생기면 /ai-video/setup 으로 연결 */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => console.log('TODO(HOME): AI 화상 15분 시작')}
                >
                  <span aria-hidden="true">🤖</span> AI 화상 15분
                </Button>
                {/* 챗봇 F5 진입점 — 페르소나 설정(W-10)부터 시작한다. */}
                <Button variant="secondary" size="sm" onClick={() => navigate('/chatbot/persona')}>
                  <span aria-hidden="true">💬</span> AI 챗봇
                </Button>
              </div>
            </div>
          </Stack>
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
