import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  Callout,
  Card,
  Cluster,
  EmptyState,
  Spinner,
  Stack,
  Steps,
} from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { ONBOARDING_STEP, ONBOARDING_STEP_COUNT, ONBOARDING_STEP_LABELS } from '@/features/auth/onboardingSteps'
import { getMyFaceAnalysis } from './api'
import { faceTypeImage } from './faceImage'
import { FACE_TYPE_DESCRIPTION, type FaceAnalysisResult } from './types'

/* -------------------------------------------------------------------------- */
/*  W-05b · 얼굴상 결과 (PROFILE-03)                                           */
/*                                                                            */
/*  촬영 화면에서 결과 표시를 떼어낸 별도 화면이다. 분리한 이유:                 */
/*   - 결과는 촬영 없이도 다시 볼 수 있어야 한다(마이페이지 → 얼굴상 결과)       */
/*   - 저장 직후 상태가 `PENDING` 일 수 있어 **다시 조회**할 자리가 필요하다     */
/*                                                                            */
/*  항상 서버의 최신 결과(GET /users/me/face-analysis)를 기준으로 그린다 —      */
/*  촬영 화면이 넘겨준 값을 신뢰하지 않으므로, 새로고침해도 화면이 유지된다.     */
/* -------------------------------------------------------------------------- */

export interface FaceResultPageProps {
  /** 온보딩 단계인지, 마이페이지에서 확인하는지 */
  mode?: 'onboarding' | 'recapture'
}

export function FaceResultPage({ mode = 'onboarding' }: FaceResultPageProps) {
  const navigate = useNavigate()
  const onboarding = mode === 'onboarding'

  const [result, setResult] = useState<FaceAnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const capturePath = onboarding ? '/signup/face' : '/me/edit/face'
  const nextPath = onboarding ? '/signup/survey' : '/me/edit'

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // 아직 결과가 없으면 api 계층이 null 로 정규화한다(404 는 오류가 아니다)
      setResult(await getMyFaceAnalysis())
    } catch (error) {
      setLoadError(errorMessageOf(error, '분석 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const goNext = () => navigate(nextPath, { replace: true })
  const goCapture = () => navigate(capturePath, { replace: true })

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-6">
      <header className="mb-5">
        {onboarding ? (
          <Steps
            count={ONBOARDING_STEP_COUNT}
            current={ONBOARDING_STEP.face}
            labels={ONBOARDING_STEP_LABELS}
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => navigate('/me/edit')}>
            ‹ 개인정보 관리
          </Button>
        )}
        <h1 className="bt-h2 mt-4">얼굴상 결과</h1>
        <p className="bt-body-sm bt-muted mt-1">
          재미로 보는 결과예요. 매칭에서는 참고 정보로만 쓰이고, 사진은 이미 폐기됐어요.
        </p>
      </header>

      {loading ? (
        <div className="grid place-items-center py-16" aria-busy="true">
          <Spinner size={28} />
        </div>
      ) : loadError ? (
        <Stack gap={12}>
          <Callout tone="danger" icon="report">
            {loadError}
          </Callout>
          <Cluster gap={8}>
            <Button variant="secondary" onClick={() => void load()}>
              다시 시도
            </Button>
            <Button variant="ghost" onClick={goNext}>
              {onboarding ? '건너뛰기' : '돌아가기'}
            </Button>
          </Cluster>
        </Stack>
      ) : (
        <ResultBody
          result={result}
          onboarding={onboarding}
          onRefresh={() => void load()}
          onCapture={goCapture}
          onNext={goNext}
        />
      )}
    </main>
  )
}

interface ResultBodyProps {
  result: FaceAnalysisResult | null
  onboarding: boolean
  onRefresh: () => void
  onCapture: () => void
  onNext: () => void
}

/**
 * 상태별 본문.
 *
 * `status` 는 백엔드 `FaceAnalysisStatus` 4종이다. COMPLETED 만 결과가 있고,
 * 나머지는 재촬영으로 안내한다 — 화면에서 벗어나지 않고 되돌아갈 길을 준다.
 */
function ResultBody({ result, onboarding, onRefresh, onCapture, onNext }: ResultBodyProps) {
  const nextLabel = onboarding ? '다음 · 설문' : '완료'

  // 아직 한 번도 찍지 않은 사용자. 온보딩에서는 건너뛸 수 있어야 한다(얼굴상은 필수가 아니다).
  if (!result) {
    return (
      <Card>
        <EmptyState
          title="아직 얼굴상 결과가 없어요"
          text="얼굴을 촬영하면 얼굴상을 분석해 드려요. 없이도 매칭은 진행돼요."
        />
        <Cluster gap={8}>
          <Button variant="primary" onClick={onCapture}>
            촬영하러 가기
          </Button>
          <Button variant="ghost" onClick={onNext}>
            {onboarding ? '건너뛰기' : '돌아가기'}
          </Button>
        </Cluster>
      </Card>
    )
  }

  if (result.status === 'PENDING') {
    return (
      <Card>
        <Stack gap={14}>
          <Callout tone="info" icon="info-circle">
            분석이 아직 끝나지 않았어요. 잠시 후 다시 확인해 주세요.
          </Callout>
          <Cluster gap={8}>
            <Button variant="primary" onClick={onRefresh}>
              결과 다시 확인
            </Button>
            <Button variant="ghost" onClick={onNext}>
              {onboarding ? '건너뛰기' : '돌아가기'}
            </Button>
          </Cluster>
        </Stack>
      </Card>
    )
  }

  if (result.status !== 'COMPLETED') {
    // FAILED(품질 미달로 종료) · EXPIRED(요청 유효기간 경과)
    return (
      <Card>
        <Stack gap={14}>
          <Callout tone="warning" icon="lock">
            {result.status === 'EXPIRED'
              ? '분석 요청이 만료됐어요. 다시 촬영해 주세요.'
              : '분석을 끝내지 못했어요. 밝은 곳에서 정면으로 다시 촬영해 주세요.'}
          </Callout>
          <Cluster gap={8}>
            <Button variant="primary" onClick={onCapture}>
              다시 촬영
            </Button>
            <Button variant="ghost" onClick={onNext}>
              {onboarding ? '건너뛰기' : '돌아가기'}
            </Button>
          </Cluster>
        </Stack>
      </Card>
    )
  }

  // 1순위 = rank 1. 서버가 정렬해 주지만 순서를 가정하지 않고 직접 고른다.
  const primaryTag = result.tags.find((tag) => tag.code === result.primaryType)
  const others = result.tags.filter((tag) => tag.code !== result.primaryType).slice(0, 2)

  return (
    <Stack gap={12}>
      <Card>
        <Stack gap={14}>
          {/* 진단 결과 이미지가 곧 프로필 사진이 된다 — 여기서 먼저 보여줘
              마이페이지·헤더에서 다시 봤을 때 같은 그림이라는 걸 알게 한다. */}
          <div className="flex items-center gap-4">
            <img
              src={faceTypeImage(result.primaryType)}
              alt=""
              width={96}
              height={96}
              className="size-24 shrink-0 rounded-full border border-line bg-surface-sunken object-cover"
            />
            <div className="min-w-0">
              <span className="bt-overline">가장 가까운 얼굴상</span>
              <div className="bt-h1 mt-1">{result.primaryTypeDisplayName}</div>
            </div>
          </div>
          <p className="bt-body-sm">{FACE_TYPE_DESCRIPTION[result.primaryType]}</p>

          {others.length > 0 && (
            <div>
              <span className="bt-caption bt-muted">함께 나온 얼굴상</span>
              <Cluster gap={8} className="mt-2">
                {others.map((tag) => (
                  <Badge key={tag.code} tone="neutral">
                    {tag.displayName}
                  </Badge>
                ))}
              </Cluster>
            </div>
          )}

          {/* 확신도를 숨기면 '왜 이 결과인지' 물어볼 근거가 사라진다. 단, 점수를
              전면에 두면 등수처럼 읽히므로 보조 정보로만 적는다. */}
          {primaryTag && (
            <p className="bt-caption bt-muted">
              유사도 <span className="bt-numeric">{Math.round(primaryTag.relativeScore * 100)}</span>%
              · 모델 {result.modelVersion}
            </p>
          )}

          <Cluster gap={8}>
            <Button variant="primary" onClick={onNext}>
              {nextLabel}
            </Button>
            <Button variant="ghost" onClick={onCapture}>
              다시 찍기
            </Button>
          </Cluster>
        </Stack>
      </Card>

      <Callout tone="info">
        얼굴상은 상대에게 공개돼요. 마음에 들지 않으면 언제든 다시 찍을 수 있고, 마이페이지에서 얼굴
        촬영 동의를 끄면 태그가 삭제됩니다.
      </Callout>
    </Stack>
  )
}

/** 마이페이지 → 개인정보 관리에서 얼굴상 결과만 확인하는 진입점(W-19b). */
export function FaceResultRecapturePage() {
  return <FaceResultPage mode="recapture" />
}
