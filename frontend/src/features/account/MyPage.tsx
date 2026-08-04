import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Avatar,
  AlertDialog,
  Button,
  Callout,
  Card,
  CardHeader,
  Chip,
  ListRowButton,
  ListRowLink,
  Spinner,
  Stack,
} from '@/components'
import { useAuthStore } from '@/stores/auth.store'

/* -------------------------------------------------------------------------- */
/*  W-19 · 마이페이지 (FE-ACCOUNT-01)                                          */
/*  1차 확정 옵션:                                                             */
/*   ① 2단(프로필 | 섹션)  ② 연락처 카드 제외  ③ 키 제외                        */
/*   ④ 동의 관리 = 별도 화면 링크(AUTH-03 · /me/consent)                        */
/*   ⑤ 개인정보 수정·관리(W-19b) = 진입 링크(/me/edit)                          */
/*  - 마이페이지는 '허브' — 동의/개인정보 관리 실 구현은 각 별도 스토리(466/465) */
/* -------------------------------------------------------------------------- */

/** 사랑의 온도 표시. 36.5 기준, 현재값을 게이지로. (전용 컴포넌트 없어 페이지 로컬) */
function LoveTemperature({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value - 30) / (42 - 30)) * 100))
  return (
    <div className="w-full">
      <div className="flex items-end justify-center gap-1">
        <span className="bt-numeric text-[34px] font-extrabold leading-none tracking-[-0.02em] text-brand">
          {value.toFixed(1)}
        </span>
        <span className="mb-1 text-[18px] font-extrabold text-brand">°</span>
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
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--bt-pollen-500), var(--bt-rose-500))' } as CSSProperties}
        />
      </div>
    </div>
  )
}

export function MyPage() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const signOut = useAuthStore((s) => s.signOut)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  /**
   * 로그아웃.
   *
   * `logout`(로컬 토큰만 삭제)이 아니라 `signOut` 을 쓴다 — 서버 `/auth/logout` 으로
   * **refresh 토큰까지 무효화**해야 한다. 로컬만 지우면 그 refresh 토큰이 서버에
   * 살아 있어 재사용될 수 있다.
   *
   * 서버 호출이 실패해도 스토어가 로컬 세션을 반드시 비우므로(스토어 주석 참고),
   * 여기서는 실패를 따로 처리하지 않고 항상 로그인 화면으로 보낸다 —
   * "로그아웃을 눌렀는데 로그인 상태로 남는" 상황이 가장 나쁘다.
   */
  const onSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
      navigate('/login', { replace: true })
    }
  }

  const onWithdraw = () => {
    // TODO(ACCOUNT): DELETE /api/me — §22 보존·삭제 범위 안내 후 처리
    console.log('withdraw account')
    setWithdrawOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <main className="mx-auto w-full max-w-[980px] p-5 sm:p-8">
      <header className="mb-6">
        <h1 className="bt-h2">마이페이지</h1>
        <p className="bt-body-sm bt-muted mt-1">내 정보와 개인정보 설정을 관리해요.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        {/* ── 좌: 프로필 요약 ─────────────────────────── */}
        <Card>
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar size="lg" name="유월" />
            <b className="text-[17px]">유월</b>
            <span className="bt-caption">20대 후반 · 서울 강남구</span>
            <div className="mt-1 flex gap-1.5">
              <Chip>🐰 토끼상</Chip>
              <Chip>🌙 차분한</Chip>
            </div>
            <div className="mt-2 w-full">
              <LoveTemperature value={38.2} />
            </div>
            <Button
              variant="secondary"
              size="sm"
              block
              className="mt-3"
              onClick={() => navigate('/me/edit')}
            >
              프로필 수정
            </Button>
          </div>
        </Card>

        {/* ── 우: 관리 링크 + 기록 + 계정 ───────────────── */}
        <Stack gap={16}>
          <Card>
            <CardHeader title="개인정보 · 동의" />
            <Stack gap={8}>
              <ListRowLink
                as={Link}
                to="/me/consent"
                title="개인정보 동의 관리"
                meta="목적별 동의 확인·철회 (AUTH-03)"
                trailing={<span className="bt-caption text-link">관리 ›</span>}
              />
              <ListRowLink
                as={Link}
                to="/me/edit"
                title="개인정보 수정·관리"
                meta="얼굴 재촬영 · 이상형 설문 · 프로필 · 지역 (W-19b)"
                trailing={<span className="bt-caption text-link">이동 ›</span>}
              />
            </Stack>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="참여 기록" />
              <div className="flex gap-7">
                {[
                  { v: 8, k: '완료 세션' },
                  { v: 0, k: '노쇼' },
                  { v: 1, k: '취소' },
                ].map((s) => (
                  <div key={s.k} className="flex flex-col gap-0.5">
                    <span className="bt-numeric text-[22px] font-extrabold">{s.v}</span>
                    <span className="bt-caption">{s.k}</span>
                  </div>
                ))}
              </div>
              <p className="bt-caption mt-2">노쇼 패널티는 6개월 단위로 소멸해요.</p>
            </Card>

            <Card>
              <CardHeader title="계정" />
              <Stack gap={4}>
                <ListRowButton title="차단 목록" meta="2명" onClick={() => console.log('TODO: 차단 목록')} />
                <ListRowButton title="얼굴 재촬영" onClick={() => navigate('/me/edit')} />
                <ListRowButton title="비밀번호 변경" onClick={() => console.log('TODO: 비밀번호 변경')} />
                {/* 로그아웃과 회원 탈퇴는 성격이 전혀 다르다(되돌릴 수 있음 vs 없음).
                    구분선으로 떼어 두 행이 나란히 보이지 않게 한다 — 오클릭이 곧 탈퇴가 되면 안 된다. */}
                <ListRowButton
                  title="로그아웃"
                  meta={signingOut ? '로그아웃 중…' : undefined}
                  disabled={signingOut}
                  trailing={signingOut ? <Spinner size={16} /> : undefined}
                  onClick={() => void onSignOut()}
                />
                <div
                  aria-hidden="true"
                  className="my-1"
                  style={{ borderTop: '1px solid var(--bt-color-border)' }}
                />
                <ListRowButton
                  title={<span className="text-danger">회원 탈퇴</span>}
                  disabled={signingOut}
                  onClick={() => setWithdrawOpen(true)}
                />
              </Stack>
            </Card>
          </div>

          <Callout tone="info">
            상대에게 공개되는 정보는 <b>닉네임 · 연령대 · 얼굴상</b>뿐이에요. 실명·전화·정확한 지역은 노출되지 않아요.
          </Callout>
        </Stack>
      </div>

      <AlertDialog
        open={withdrawOpen}
        onCancel={() => setWithdrawOpen(false)}
        onConfirm={onWithdraw}
        tone="danger"
        title="정말 탈퇴할까요?"
        description="탈퇴하면 프로필·리포트·동의 내역이 처리방침(§22)에 따라 삭제돼요. 이 작업은 되돌릴 수 없어요."
        confirmLabel="탈퇴하기"
        cancelLabel="취소"
      />
    </main>
  )
}

/* 동의 관리(AUTH-03)는 features/account/ConsentManagePage.tsx,
   개인정보 수정·관리(W-19b)는 features/account/AccountEditPage.tsx 로 분리 구현됨 */
