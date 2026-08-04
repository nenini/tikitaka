import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, CardHeader, ListRow, Stack, TagChip } from '@/components'
import { AuthPlaceholder } from '@/features/auth/AuthPlaceholder'

/* -------------------------------------------------------------------------- */
/*  W-19b · 개인정보 수정·관리 (FE-ACCOUNT-02)                                  */
/*  1차 확정 옵션:                                                            */
/*   ① 편집 진입 = 항목별 별도 편집 화면(라우트)                                */
/*   ② 이번 차수 = 편집 화면 전부 스텁(허브만 실구현)                           */
/*   ③ 프로필·지역 2단 카드(+모바일 자동 1단)   ④ 현재값 요약 표시              */
/*  - 데이터는 데모 고정. TODO(ACCOUNT): GET /api/v1/users/me/profile·survey    */
/* -------------------------------------------------------------------------- */

/** 현재값 요약 한 줄. (label — value) */
function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return <ListRow title={label} trailing={<span className="bt-body-sm font-semibold">{value}</span>} />
}

export function AccountEditPage() {
  const navigate = useNavigate()

  return (
    <main className="mx-auto w-full max-w-[860px] px-4 pt-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/me')}>
          ‹ 마이페이지
        </Button>
        <h1 className="bt-h2">개인정보 수정·관리</h1>
      </div>
      <p className="bt-body-sm bt-muted mb-4">
        온보딩할 때 입력한 개인정보를 언제든 다시 찍거나 수정할 수 있어요. 상대에게 공개되는 항목은{' '}
        <b className="text-ink">닉네임 · 연령대 · 얼굴상</b>뿐이에요.
      </p>

      <Stack gap={12}>
        {/* ── 얼굴 사진·얼굴상 ─────────────────────────── */}
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardHeader title="얼굴 사진 · 얼굴상" />
              <p className="bt-caption mt-1">
                얼굴을 다시 찍으면 얼굴상 태그가 재분석돼요. 원본은 분석 후 즉시 삭제됩니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TagChip>🐰 토끼상</TagChip>
              <Button variant="secondary" size="sm" onClick={() => navigate('/me/edit/face')}>
                얼굴 다시 찍기
              </Button>
            </div>
          </div>
        </Card>

        {/* ── 이상형·개선 목표 설문 ─────────────────────── */}
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardHeader title="이상형 · 개선 목표 설문" />
              <p className="bt-caption mt-1">
                보여주고 싶은 모습 · 원하는 상대 · 선호 얼굴상 · 개선 목표를 다시 응답해요.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate('/me/edit/survey')}>
              설문 다시 하기
            </Button>
          </div>
          <div>
            <SummaryRow label="원하는 상대의 모습" value="다정 · 느긋 · 친근" />
            <SummaryRow label="선호 얼굴상" value="🐰 🐱" />
            <SummaryRow label="개선 목표" value="발화량 줄이기 · 성량 키우기" />
          </div>
        </Card>

        {/* ── 기본 프로필 · 지역 (2단) ──────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <CardHeader title="기본 프로필" />
              <Button variant="ghost" size="sm" onClick={() => navigate('/me/edit/profile')}>
                수정
              </Button>
            </div>
            <div>
              <SummaryRow label="닉네임" value="유월" />
              <SummaryRow label="성별" value="여성" />
              <SummaryRow label="선호 연령" value="27–33세" />
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <CardHeader title="지역 (시·도)" />
              <Button variant="ghost" size="sm" onClick={() => navigate('/me/edit/region')}>
                수정
              </Button>
            </div>
            <div>
              <SummaryRow label="시·도" value="서울특별시" />
            </div>
            <p className="bt-caption">챗봇 대화 주제·장소 추천에만 쓰이고 상대에게 공개되지 않아요.</p>
          </Card>
        </div>

        <Callout tone="info">
          키·직업·실명·전화번호·상세 주소는 <b>수집하지 않아요.</b> 얼굴상은 항상 공개되며, 얼굴 촬영 동의를 끄면 태그가
          삭제됩니다(마이페이지에서 관리).
        </Callout>
      </Stack>
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/*  항목별 편집 화면 — 이번 차수 전부 스텁(별도 스토리). backTo = 허브(/me/edit)  */
/* -------------------------------------------------------------------------- */

/* 얼굴 재촬영은 온보딩 촬영 화면을 모드로 재사용한다 — features/face/FaceCapturePage */

export function SurveyEditPage() {
  return (
    <AuthPlaceholder
      title="이상형 · 개선 목표 설문 재응답 (W-19b)"
      note="온보딩 설문(W-06)을 다시 응답합니다 — 다음 차수에서 구현합니다."
      backTo="/me/edit"
      backLabel="개인정보 관리로 돌아가기"
    />
  )
}

export function ProfileEditPage() {
  return (
    <AuthPlaceholder
      title="기본 프로필 수정 (W-19b)"
      note="닉네임 · 성별 · 선호 연령을 수정합니다 — 다음 차수에서 구현합니다."
      backTo="/me/edit"
      backLabel="개인정보 관리로 돌아가기"
    />
  )
}

export function RegionEditPage() {
  return (
    <AuthPlaceholder
      title="지역(시·도) 수정 (W-19b)"
      note="챗봇 추천에 쓰이는 시·도를 수정합니다 — 다음 차수에서 구현합니다."
      backTo="/me/edit"
      backLabel="개인정보 관리로 돌아가기"
    />
  )
}
