import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Callout,
  Card,
  CardHeader,
  Chip,
  Field,
  Input,
  ListRowButton,
  ListRowLink,
  Modal,
  Spinner,
  Stack,
} from '@/components'
import { errorCodeOf, errorMessageOf } from '@/shared/api/envelope'
import { requestPasswordReset, withdrawAccount } from '@/features/auth/api'
import { faceTypeImage } from '@/features/face/faceImage'
import { resetMyFaceAnalysis, useMyFaceAnalysis } from '@/features/face/useMyFaceAnalysis'
import { getMyProfile, getPublicProfile } from '@/features/profile/api'
import type { ProfileResponse } from '@/features/profile/types'
import { getMySurvey } from '@/features/survey/api'
import type { SurveyAnswer } from '@/features/survey/types'
import { useAuthStore } from '@/stores/auth.store'

/* -------------------------------------------------------------------------- */
/*  W-19 · 마이페이지 (FE-ACCOUNT-01)                                          */
/*  1차 확정 옵션:                                                             */
/*   ① 2단(프로필 | 섹션)  ② 연락처 카드 제외  ③ 키 제외                        */
/*   ④ 동의 관리 = 별도 화면 링크(AUTH-03 · /me/consent)                        */
/*   ⑤ 개인정보 수정·관리(W-19b) = 진입 링크(/me/edit)                          */
/*  - 마이페이지는 '허브' — 동의/개인정보 관리 실 구현은 각 별도 스토리(466/465) */
/* -------------------------------------------------------------------------- */

/**
 * 프로필 카드에 쓰는 요약값. 온보딩·개인정보 수정에서 설정한 것이 그대로 올라온다.
 *
 * ⚠️ **나이는 `GET /users/me/profile` 에도 `GET /users/me` 에도 없다.**
 *    생년월일을 내려주는 응답이 없고, 나이가 들어 있는 건 `PublicProfileResponse`
 *    뿐이라 내 `userId` 로 공개 프로필을 부른다. 이 엔드포인트에는 열람 제한이 없어
 *    본인 조회도 그대로 통한다(2026-08-04 로컬 서버로 확인).
 *    `/me` 계열에 나이가 추가되면 그쪽으로 옮기는 게 맞다.
 */
interface ProfileSummary {
  profile: ProfileResponse
  age: number | null
  survey: SurveyAnswer | null
}

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
  const authUser = useAuthStore((s) => s.user)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawPassword, setWithdrawPassword] = useState('')
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  // 비밀번호 재설정 메일 — 발송은 되돌릴 수 없지만 파괴적이지도 않아 확인 한 번만 받는다.
  const [pwOpen, setPwOpen] = useState(false)
  const [pwSending, setPwSending] = useState(false)
  const [pwSent, setPwSent] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const face = useMyFaceAnalysis()
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      // userId 를 알아야 공개 프로필을 부를 수 있어 프로필이 먼저다.
      const profile = await getMyProfile()
      const [publicProfile, survey] = await Promise.all([
        // 설문은 아직 없을 수 있다(온보딩 중 이탈). 없다고 이 카드를 통째로 막지 않는다.
        getPublicProfile(profile.userId).catch(() => null),
        getMySurvey().catch(() => null),
      ])
      setSummary({ profile, age: publicProfile?.age ?? null, survey })
    } catch (error) {
      setSummaryError(errorMessageOf(error, '프로필을 불러오지 못했어요.'))
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

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
      // 얼굴상 캐시는 모듈 단위라 로그아웃해도 살아남는다 — 비우지 않으면 다음 계정이
      // 로그인했을 때 이전 사용자의 동물 이미지가 헤더에 잠깐 남는다.
      resetMyFaceAnalysis()
      navigate('/login', { replace: true })
    }
  }

  // 프로필을 읽기 전에는 /me 의 실명으로 버틴다 — 아바타 이니셜이 빈 칸으로 깜빡이지 않게.
  const displayName = summary?.profile.nickname ?? authUser?.nickname ?? '내 프로필'

  // 나이·지역 중 없는 값은 빼고 잇는다. 둘 다 없으면 줄 자체를 비우지 않고 미설정을 알린다.
  const metaLine =
    [summary?.age != null ? `${summary.age}세` : null, summary?.profile.regionCity || null]
      .filter(Boolean)
      .join(' · ') || '아직 설정하지 않았어요'

  /**
   * 회원 탈퇴.
   *
   * 예전에는 `console.log` 만 찍고 로그아웃했다 — **눌러도 계정이 그대로 살아 있었다.**
   * 다시 로그인하면 아무 일도 없었던 것처럼 들어와졌다.
   *
   * 서버는 본인 확인을 위해 비밀번호를 요구한다. 실패하면 다이얼로그를 **닫지 않는다** —
   * 닫아 버리면 무엇이 잘못됐는지 모른 채 처음부터 다시 해야 한다.
   */
  /**
   * 비밀번호 재설정 메일 발송.
   *
   * 서버는 계정 존재 여부를 흘리지 않으려고 **없는 이메일에도 202** 를 준다 →
   * "보냈다"고 단정하지 않고 받은 편지함을 확인하라고만 안내한다.
   */
  const onRequestPasswordReset = async () => {
    const email = authUser?.email
    if (!email || pwSending) return
    setPwSending(true)
    setPwError(null)
    try {
      await requestPasswordReset(email)
      setPwSent(true)
    } catch (error) {
      setPwError(errorMessageOf(error, '메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setPwSending(false)
    }
  }

  const onWithdraw = async () => {
    const password = withdrawPassword.trim()
    if (password.length === 0) {
      setWithdrawError('비밀번호를 입력해 주세요.')
      return
    }
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      await withdrawAccount(password)
    } catch (error) {
      setWithdrawError(
        errorCodeOf(error) === 'INVALID_CREDENTIALS'
          ? '비밀번호가 맞지 않아요.'
          : errorMessageOf(error, '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.'),
      )
      return
    } finally {
      setWithdrawing(false)
    }

    // 성공한 뒤에만 로컬 상태를 정리한다. 서버가 거절했는데 로그아웃시키면
    // 사용자는 탈퇴된 줄 알고 떠난다.
    closeWithdraw()
    resetMyFaceAnalysis()
    logout()
    navigate('/login', { replace: true })
  }

  /** 다이얼로그를 닫을 때 입력과 오류를 함께 비운다 — 다시 열었을 때 남아 있으면 안 된다. */
  const closeWithdraw = () => {
    setWithdrawOpen(false)
    setWithdrawPassword('')
    setWithdrawError(null)
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
            {/* 얼굴상 진단을 마쳤으면 그 동물 이미지가 프로필 사진이 된다.
                아직이면 src 가 undefined 라 Avatar 가 닉네임 이니셜로 돌아간다. */}
            <Avatar size="lg" round name={displayName} src={faceTypeImage(face?.primaryType)} />
            <b className="text-[17px]">{displayName}</b>

            {summaryLoading ? (
              <Spinner size={18} />
            ) : summaryError ? (
              <>
                <span className="bt-caption text-danger">{summaryError}</span>
                <Button variant="ghost" size="sm" onClick={() => void loadSummary()}>
                  다시 시도
                </Button>
              </>
            ) : (
              <>
                <span className="bt-caption">{metaLine}</span>
                {/* 얼굴상은 분석 결과, 성향은 설문의 `userTraits`(본인 성격 3개)에서 온다.
                    둘 다 아직 없을 수 있으므로 칩이 하나도 없는 경우를 정상으로 둔다. */}
                <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                  {face && <Chip>{face.primaryTypeDisplayName}</Chip>}
                  {summary?.survey?.userTraits.map((trait) => (
                    <Chip key={trait.id}>{trait.name}</Chip>
                  ))}
                </div>
              </>
            )}
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
                meta="목적별 동의 확인·철회"
                trailing={<span className="bt-caption text-link">관리 ›</span>}
              />
              <ListRowLink
                as={Link}
                to="/me/edit"
                title="개인정보 수정·관리"
                meta="얼굴 재촬영 · 이상형 설문 · 프로필 · 지역"
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
                {/* 촬영 화면으로 곧장 보낸다. 예전에는 허브(`/me/edit`)로 보내서
                    '얼굴 재촬영'을 눌러도 한 번 더 찾아 들어가야 했다. */}
                <ListRowButton title="얼굴 재촬영" onClick={() => navigate('/me/edit/face')} />
                {/* 서버에 '현재 비밀번호로 즉시 변경'하는 경로가 없다 — 메일 링크 방식뿐이라
                    확인 모달을 거쳐 재설정 메일을 보낸다(api.ts `requestPasswordReset` 참고). */}
                <ListRowButton
                  title="비밀번호 변경"
                  meta="가입 이메일로 재설정 링크를 보내요"
                  disabled={signingOut}
                  onClick={() => {
                    setPwSent(false)
                    setPwError(null)
                    setPwOpen(true)
                  }}
                />
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

      {/* 문구를 실제 동작에 맞춘다. 예전에는 '프로필·리포트·동의 내역이 삭제된다'고 적혀
          있었지만 서버는 계정을 **비활성 처리**할 뿐이다. 지우지 않는 것을 지운다고 말하면
          개인정보 안내로서 틀린 말이 된다. */}
      {/* 비밀번호 변경 — 메일 링크 방식이라 '보내기 → 안내' 두 단계로 끝난다 */}
      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title={pwSent ? '메일을 확인해 주세요' : '비밀번호를 변경할까요?'}
        actions={
          pwSent ? (
            <Button variant="primary" onClick={() => setPwOpen(false)}>
              확인
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPwOpen(false)} disabled={pwSending}>
                취소
              </Button>
              <Button
                variant="primary"
                loading={pwSending}
                disabled={!authUser?.email}
                onClick={() => void onRequestPasswordReset()}
              >
                재설정 메일 보내기
              </Button>
            </>
          )
        }
      >
        <Stack gap={10}>
          {pwSent ? (
            <>
              {/* 서버가 존재하지 않는 계정에도 202 를 주므로 '보냈다'고 단정하지 않는다 */}
              <p className="bt-body-sm">
                <b>{authUser?.email}</b> 로 재설정 링크를 요청했어요. 받은 편지함을 확인해 주세요.
              </p>
              <p className="bt-caption bt-muted">
                메일이 보이지 않으면 스팸함도 확인해 주세요. 링크는 일정 시간이 지나면 만료돼요.
              </p>
            </>
          ) : (
            <>
              <p className="bt-body-sm">
                가입 이메일 <b>{authUser?.email ?? '—'}</b> 로 재설정 링크를 보내 드려요. 링크에서
                새 비밀번호를 정하면 됩니다.
              </p>
              {/* 소셜 가입 계정은 비밀번호가 없다 — 링크를 받아도 쓸 데가 없다는 걸 미리 알린다 */}
              <p className="bt-caption bt-muted">
                소셜 로그인으로 가입했다면 설정할 비밀번호가 없어 메일이 오지 않을 수 있어요.
              </p>
              {pwError && <Callout tone="danger">{pwError}</Callout>}
            </>
          )}
        </Stack>
      </Modal>

      <Modal
        open={withdrawOpen}
        onClose={closeWithdraw}
        role="alertdialog"
        showClose={false}
        closeOnBackdrop={false}
        title="정말 탈퇴할까요?"
        actions={
          <>
            <Button variant="ghost" onClick={closeWithdraw} disabled={withdrawing}>
              취소
            </Button>
            <Button
              variant="danger"
              leadingIcon="warning"
              loading={withdrawing}
              onClick={() => void onWithdraw()}
            >
              탈퇴하기
            </Button>
          </>
        }
      >
        <Stack gap={12}>
          <p className="bt-body-sm">
            탈퇴하면 계정이 즉시 비활성화되어 <b>다시 로그인할 수 없어요.</b> 이 작업은 되돌릴 수
            없어요.
          </p>
          <p className="bt-caption bt-muted">
            지난 세션·리포트 기록은 상대방의 기록과 얽혀 있어 바로 지워지지 않고, 처리방침(§22)에
            따라 보관 기간이 지난 뒤 정리돼요.
          </p>
          <Field label="본인 확인" required error={withdrawError} help="가입할 때 쓴 비밀번호를 입력해 주세요.">
            <Input
              type="password"
              autoComplete="current-password"
              value={withdrawPassword}
              disabled={withdrawing}
              onChange={(e) => setWithdrawPassword(e.target.value)}
              // Enter 로도 진행할 수 있어야 한다 — 비밀번호 칸에서 버튼까지 가는 건 번거롭다.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !withdrawing) void onWithdraw()
              }}
            />
          </Field>
        </Stack>
      </Modal>
    </main>
  )
}

/* 동의 관리(AUTH-03)는 features/account/ConsentManagePage.tsx,
   개인정보 수정·관리(W-19b)는 features/account/AccountEditPage.tsx 로 분리 구현됨 */
