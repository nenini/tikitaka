import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, CardHeader, ListRow, Spinner, Stack, TagChip } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getMyFaceAnalysis } from '@/features/face/api'
import type { FaceAnalysisResult } from '@/features/face/types'
import { getMyProfile } from '@/features/profile/api'
import type { ProfileResponse } from '@/features/profile/types'
import { getMySurvey } from '@/features/survey/api'
import type { SurveyAnswer } from '@/features/survey/types'

/* -------------------------------------------------------------------------- */
/*  W-19b · 개인정보 수정·관리 (FE-ACCOUNT-02 / PROFILE-01)                     */
/*  1차 확정 옵션:                                                            */
/*   ① 편집 진입 = 항목별 별도 편집 화면(라우트)                                */
/*   ② 프로필·지역 2단 카드(+모바일 자동 1단)   ③ 현재값 요약 표시              */
/*                                                                            */
/*  요약값은 전부 서버에서 읽는다 — 고정 데이터를 두지 않는다.                  */
/*    GET /v1/users/me/profile        닉네임 · 성별 · 시·도                     */
/*    GET /v1/users/me/survey         선호 얼굴상 · 성격 · 연령 · 개선 목표      */
/*    GET /v1/users/me/face-analysis  분석된 얼굴상                             */
/*                                                                            */
/*  설문·얼굴상은 **아직 없을 수 있다**(각각 null). 프로필만 필수다 — 이 화면은  */
/*  온보딩 게이트 뒤에 있어 프로필 없이는 도달할 수 없고, 없다면 진짜 오류다.    */
/* -------------------------------------------------------------------------- */

/** 값이 아직 없을 때 쓰는 문구. 빈 칸으로 두면 불러오기 실패와 구분되지 않는다. */
const NOT_SET = '아직 없어요'

/** 현재값 요약 한 줄. (label — value) */
function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return <ListRow title={label} trailing={<span className="bt-body-sm font-semibold">{value}</span>} />
}

/** 이름 목록을 요약 한 줄로. 비어 있으면 미설정 문구. */
function nameList(items: readonly { name: string }[] | undefined): string {
  if (!items?.length) return NOT_SET
  return items.map((item) => item.name).join(' · ')
}

interface HubData {
  profile: ProfileResponse
  survey: SurveyAnswer | null
  face: FaceAnalysisResult | null
}

export function AccountEditPage() {
  const navigate = useNavigate()

  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // 셋을 동시에 읽는다. 설문·얼굴상은 미등록이면 api 계층에서 null 로 정규화된다.
      const [profile, survey, face] = await Promise.all([
        getMyProfile(),
        getMySurvey(),
        getMyFaceAnalysis(),
      ])
      setData({ profile, survey, face })
    } catch (error) {
      setLoadError(errorMessageOf(error, '내 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <main className="mx-auto grid w-full max-w-[860px] place-items-center px-4 py-20" aria-busy="true">
        <Spinner size={28} />
      </main>
    )
  }

  if (loadError || !data) {
    return (
      <main className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6">
        <Stack gap={12}>
          <Callout tone="danger" icon="report">
            {loadError ?? '내 정보를 불러오지 못했어요.'}
          </Callout>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              다시 시도
            </Button>
            <Button variant="ghost" onClick={() => navigate('/me')}>
              마이페이지로
            </Button>
          </div>
        </Stack>
      </main>
    )
  }

  const { profile, survey, face } = data

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
              {face ? (
                <TagChip>{face.primaryTypeDisplayName}</TagChip>
              ) : (
                <span className="bt-body-sm bt-muted">{NOT_SET}</span>
              )}
              <Button variant="secondary" size="sm" onClick={() => navigate('/me/edit/face')}>
                {face ? '얼굴 다시 찍기' : '얼굴 촬영하기'}
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
              {survey ? '설문 다시 하기' : '설문 응답하기'}
            </Button>
          </div>
          <div>
            <SummaryRow label="원하는 상대의 모습" value={nameList(survey?.preferredTraits)} />
            <SummaryRow label="선호 얼굴상" value={survey?.preferredFaceTag.name ?? NOT_SET} />
            {/* 선호 연령은 프로필이 아니라 설문에서 받는다(W-06) — 그래서 이 카드에 둔다 */}
            <SummaryRow
              label="선호 연령"
              value={survey ? `${survey.minPreferredAge}–${survey.maxPreferredAge}세` : NOT_SET}
            />
            <SummaryRow label="개선 목표" value={nameList(survey?.practiceGoals)} />
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
              <SummaryRow label="닉네임" value={profile.nickname} />
              <SummaryRow label="성별" value={profile.gender === 'FEMALE' ? '여성' : '남성'} />
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
              <SummaryRow label="시·도" value={profile.regionCity || NOT_SET} />
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

/* 얼굴 재촬영은 온보딩 촬영 화면을 모드로 재사용한다 — features/face/FaceCapturePage */
/* 설문 재응답은 온보딩 설문 화면을 모드로 재사용한다 — features/survey/SurveyPage */
/* 기본 프로필·지역 수정은 각각 ProfileEditPage · RegionEditPage 로 분리했다 */
