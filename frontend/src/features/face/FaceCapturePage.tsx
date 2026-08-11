import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, Cluster, Spinner, Stack } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getMyProfile } from '@/features/profile/api'
import { ONBOARDING_STEP } from '@/features/auth/onboardingSteps'
import { OnboardingShell } from '@/features/auth/OnboardingShell'
import {
  analyzeFace,
  createFaceAnalysisRequest,
  describeFaceServiceError,
  FaceAnalysisServiceError,
  submitFaceAnalysisFailure,
  submitFaceAnalysisResult,
} from './api'
import { resetMyFaceAnalysis } from './useMyFaceAnalysis'
import { useFaceCamera } from './useFaceCamera'
import {
  FACE_FAILURE_GUIDE,
  RETAKE_LIMIT,
  type FaceAnalysisGroup,
  type FaceFailureCode,
} from './types'

/* -------------------------------------------------------------------------- */
/*  W-05 · 얼굴 촬영 (PROFILE-02)                                              */
/*                                                                            */
/*  흐름: 안내·동의 → 카메라 미리보기 → 촬영 → AI 분석 → 결과 저장             */
/*  - 원본 이미지는 AI 서비스로만 가고 백엔드에는 태그만 올린다(기능명세 §22).  */
/*  - 품질 미달이면 사유를 보여주고 재촬영. RETAKE_LIMIT 회 넘기면 건너뛰기를   */
/*    전면에 안내한다(얼굴상은 매칭 보조 정보라 필수가 아니다).                 */
/* -------------------------------------------------------------------------- */

type Phase = 'intro' | 'live' | 'analyzing' | 'retake' | 'done'

export interface FaceCapturePageProps {
  /** 온보딩 단계인지, 마이페이지에서 다시 찍는지 */
  mode?: 'onboarding' | 'recapture'
}

export function FaceCapturePage({ mode = 'onboarding' }: FaceCapturePageProps) {
  const navigate = useNavigate()
  const camera = useFaceCamera()
  const onboarding = mode === 'onboarding'

  const [phase, setPhase] = useState<Phase>('intro')
  const [agreed, setAgreed] = useState(false)
  const [group, setGroup] = useState<FaceAnalysisGroup | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [attempts, setAttempts] = useState(0)
  const [failureCode, setFailureCode] = useState<FaceFailureCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [skipping, setSkipping] = useState(false)

  /**
   * 진행 중인 분석 요청 id.
   * 재촬영해도 같은 요청을 재사용한다 — 시도할 때마다 새로 만들면 PENDING 이 쌓인다.
   */
  const requestIdRef = useRef<number | null>(null)

  /** 분석 그룹은 사용자가 정한 값(프로필 성별)을 쓴다 — AI 가 추론하면 안 된다. */
  useEffect(() => {
    let alive = true
    getMyProfile()
      .then((profile) => {
        if (alive) setGroup(profile.gender === 'MALE' ? 'male' : 'female')
      })
      .catch((fetchError) => {
        if (alive) setProfileError(errorMessageOf(fetchError, '프로필을 불러오지 못했어요.'))
      })
    return () => {
      alive = false
    }
  }, [])

  const goNext = useCallback(() => {
    camera.stop()
    navigate(onboarding ? '/signup/survey' : '/me/edit', { replace: true })
  }, [camera, navigate, onboarding])

  /**
   * 이전 단계로.
   *
   * `goNext` 와 달리 `replace` 를 쓰지 않는다 — 앞으로 가는 길은 되돌아올 이유가 없지만
   * 뒤로 가는 길은 사용자가 다시 앞으로 올 수 있어야 한다.
   *
   * 훅이 언마운트 때 트랙을 정리하지만(`useEffect(() => stop, [stop])`) 여기서 먼저 끈다 —
   * 라우팅이 한 프레임 늦어도 카메라 표시등은 즉시 꺼져야 사용자가 불안해하지 않는다.
   */
  const goBack = useCallback(() => {
    camera.stop()
    navigate(onboarding ? '/signup/profile' : '/me/edit')
  }, [camera, navigate, onboarding])

  async function startCamera() {
    setError(null)
    await camera.start()
    setPhase('live')
  }

  async function handleCapture() {
    if (!group || phase === 'analyzing') return
    setError(null)
    setFailureCode(null)

    const image = await camera.capture()
    if (!image) {
      setError('카메라 화면을 읽지 못했어요. 잠시 후 다시 시도해 주세요.')
      return
    }

    setPhase('analyzing')
    setAttempts((n) => n + 1)
    try {
      const analysis = await analyzeFace(image, group)

      if (analysis.status === 'RETAKE_REQUIRED') {
        // 사유가 여러 개면 첫 번째만 안내한다 — 한 번에 하나씩 고치는 편이 빠르다
        setFailureCode(analysis.quality.reasons[0] ?? 'INVALID_IMAGE')
        setPhase('retake')
        return
      }

      // UNCERTAIN 도 태그는 있으므로 저장한다(확신이 낮을 뿐 결과가 없는 게 아니다)
      if (requestIdRef.current == null) {
        requestIdRef.current = (await createFaceAnalysisRequest()).analysisRequestId
      }
      // 반환값은 쓰지 않는다 — 결과 화면이 서버에서 최신 상태를 다시 읽는다
      await submitFaceAnalysisResult(requestIdRef.current, {
        modelVersion: analysis.modelVersion,
        tags: analysis.tags.map((tag) => ({
          code: tag.code,
          // 백엔드가 소수 6자리까지만 받는다(@Digits(integer=1, fraction=6))
          relativeScore: Number(tag.relativeScore.toFixed(6)),
          rank: tag.rank,
        })),
      })
      camera.stop()
      // 얼굴상이 바뀌면 프로필 사진도 바뀐다. 헤더·마이페이지가 공유하는 캐시를 비워
      // 다음 조회에서 새 결과(=새 동물 이미지)를 받게 한다.
      resetMyFaceAnalysis()
      // 결과 표시는 별도 화면(PROFILE-03)이 맡는다. 그 화면이 서버에서 최신 결과를
      // 다시 읽으므로, 저장 직후 PENDING 이어도 거기서 상태를 추적할 수 있다.
      navigate(onboarding ? '/signup/face-result' : '/me/edit/face-result', { replace: true })
    } catch (analyzeError) {
      // AI 서비스 오류와 백엔드 오류를 구분해 안내한다
      setError(
        analyzeError instanceof FaceAnalysisServiceError
          ? describeFaceServiceError(analyzeError)
          : errorMessageOf(analyzeError, '분석 결과를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
      )
      setPhase('retake')
    }
  }

  /**
   * 건너뛰기. 품질 미달로 포기한 경우에만 사유를 서버에 남긴다 —
   * 아예 시도하지 않은 사용자는 요청 자체를 만들지 않는다(SKIPPED 는 서버 상태가 아니다).
   */
  async function handleSkip() {
    setSkipping(true)
    try {
      if (failureCode) {
        const id = requestIdRef.current ?? (await createFaceAnalysisRequest()).analysisRequestId
        requestIdRef.current = id
        await submitFaceAnalysisFailure(id, failureCode)
      }
    } catch {
      // 실패 기록은 부가 정보다. 남기지 못했다고 사용자를 붙잡아 두지 않는다.
    } finally {
      setSkipping(false)
      goNext()
    }
  }

  const analyzing = phase === 'analyzing'
  const overLimit = attempts >= RETAKE_LIMIT
  const canCapture = camera.status === 'ready' && Boolean(group) && !analyzing

  return (
    <FaceCaptureFrame onboarding={onboarding}>
      {profileError && (
        <Callout tone="danger" icon="report">
          {profileError} 프로필을 먼저 입력해 주세요.
        </Callout>
      )}

      {phase === 'intro' && (
        <Card>
          <Stack gap={14}>
            <div>
              <div className="bt-h3 mb-2">이렇게 찍어주세요</div>
              <ul className="bt-body-sm bt-muted list-disc pl-5">
                <li>혼자, 정면을 보고 찍어주세요.</li>
                <li>밝은 곳에서 역광을 피해주세요.</li>
                <li>모자·마스크·선글라스는 벗어주세요.</li>
                <li>얼굴이 화면 안내선을 채우도록 가까이 와주세요.</li>
              </ul>
            </div>

            <label className="bt-body-sm flex items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-1"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                얼굴 사진을 얼굴상 분석에 사용하는 데 동의합니다.
                <span className="bt-caption bt-muted block">
                  분석 후 사진은 즉시 폐기되고, 결과 태그만 저장됩니다.
                </span>
              </span>
            </label>

            {/* '이전'과 '건너뛰기'는 방향이 반대다 — 붙여 두면 오클릭이 곧 단계 건너뛰기가 된다.
                이전은 왼쪽 끝, 건너뛰기는 주 동작 옆에 둔다. */}
            <Cluster gap={8}>
              <Button variant="secondary" leadingIcon="chevron-left" onClick={goBack}>
                이전
              </Button>
              <Button variant="primary" disabled={!agreed || !group} onClick={startCamera}>
                카메라 켜기
              </Button>
              <Button variant="ghost" onClick={goNext}>
                건너뛰기
              </Button>
            </Cluster>
          </Stack>
        </Card>
      )}

      {(phase === 'live' || analyzing || phase === 'retake') && (
        <Card>
          <Stack gap={14}>
            <div
              className="relative w-full overflow-hidden rounded-[var(--bt-radius-md)] bg-black"
              style={{ aspectRatio: '4 / 3' }}
            >
              <video
                // 콜백 ref — 이 엘리먼트는 촬영 단계에서야 마운트되므로, 먼저 열린
                // 스트림을 여기서 붙여야 한다(useFaceCamera 주석 참고).
                ref={camera.attachVideo}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                // 거울처럼 보여야 자세를 맞추기 쉽다. 전송은 반전하지 않은 원본으로 한다.
                style={{ transform: 'scaleX(-1)' }}
              />
              {/* 얼굴 위치 안내선 */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/70"
              />
              {analyzing && (
                <div className="absolute inset-0 grid place-items-center bg-black/45" aria-busy="true">
                  <Stack gap={8} className="items-center">
                    <Spinner size={26} />
                    <span className="bt-body-sm text-white">분석 중이에요…</span>
                  </Stack>
                </div>
              )}
            </div>

            {camera.errorMessage && (
              <Callout tone="danger" icon="report">
                {camera.errorMessage}
              </Callout>
            )}

            {failureCode && (
              <Callout tone="warning" icon="lock">
                {FACE_FAILURE_GUIDE[failureCode]}
              </Callout>
            )}

            {error && (
              <span className="bt-error" role="alert">
                {error}
              </span>
            )}

            {overLimit && (
              <Callout tone="info" icon="check">
                잘 안 되면 건너뛰어도 괜찮아요. 얼굴상 없이도 매칭은 진행됩니다. 나중에 마이페이지에서
                다시 찍을 수 있어요.
              </Callout>
            )}

            <Cluster gap={8}>
              {/* 카메라를 켠 뒤에도 되돌아갈 길을 남긴다 — 이 단계의 출구가 '건너뛰기'(앞으로)뿐이면
                  프로필을 고치러 갈 수가 없다. 분석 중에는 잠근다(요청이 떠 있다). */}
              <Button
                variant="secondary"
                leadingIcon="chevron-left"
                disabled={analyzing || skipping}
                onClick={goBack}
              >
                이전
              </Button>
              <Button variant="primary" loading={analyzing} disabled={!canCapture} onClick={handleCapture}>
                {attempts === 0 ? '촬영하기' : '다시 촬영'}
              </Button>
              <Button variant="ghost" loading={skipping} onClick={handleSkip}>
                건너뛰기
              </Button>
              <span className="bt-caption bt-muted self-center">
                시도 <span className="bt-numeric">{attempts}</span>회
              </span>
            </Cluster>
          </Stack>
        </Card>
      )}

      {/* 결과 표시는 이 화면에 두지 않는다 — 저장 직후 /…/face-result 로 넘어간다.
          그 화면이 서버에서 최신 결과를 다시 읽어, 새로고침해도 결과가 유지된다. */}
    </FaceCaptureFrame>
  )
}

function FaceCaptureFrame({ onboarding, children }: { onboarding: boolean; children: ReactNode }) {
  if (onboarding) {
    return (
      <OnboardingShell
        current={ONBOARDING_STEP.face}
        title="얼굴상 분석"
        description="사진은 분석에만 쓰이고 바로 폐기돼요. 결과는 재미 요소이자 매칭 참고 정보입니다."
        maxWidth="md"
      >
        {children}
      </OnboardingShell>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-6">
      <header className="mb-5">
        <h1 className="bt-h2 mt-4">얼굴 다시 찍기</h1>
        <p className="bt-body-sm bt-muted mt-1">
          사진은 분석에만 쓰이고 서버에 저장하지 않아요. 결과는 재미 요소이자 매칭 참고 정보예요.
        </p>
      </header>
      {children}
    </main>
  )
}

/** 마이페이지 → 개인정보 관리에서 얼굴상만 다시 찍는 진입점(W-19b). */
export function FaceRecapturePage() {
  return <FaceCapturePage mode="recapture" />
}
