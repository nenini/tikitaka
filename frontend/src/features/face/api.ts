import { apiClient } from '@/shared/api/client'
import { unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import type {
  AiFaceAnalysis,
  FaceAnalysisFailure,
  FaceAnalysisGroup,
  FaceAnalysisRequest,
  FaceAnalysisResult,
  FaceFailureCode,
  FaceResultSubmitPayload,
} from './types'

/**
 * 얼굴상 분석 REST.
 *
 * 백엔드와 AI 서비스를 **따로** 부른다. 원본 이미지는 AI 로만 가고,
 * 백엔드에는 분석 결과(태그)만 올린다 — 이미지가 서버에 남지 않게 하는 설계다.
 */

/* ── 백엔드(결과 저장) ─────────────────────────────────── */

const BASE = '/v1/face-analyses'

/** 분석 요청 생성. 결과·실패 제출은 여기서 받은 id 로 한다. */
export async function createFaceAnalysisRequest(): Promise<FaceAnalysisRequest> {
  return unwrap(await apiClient.post<ApiEnvelope<FaceAnalysisRequest>>(BASE))
}

/** 성공(또는 UNCERTAIN) 결과 저장. */
export async function submitFaceAnalysisResult(
  analysisRequestId: number,
  payload: FaceResultSubmitPayload,
): Promise<FaceAnalysisResult> {
  return unwrap(
    await apiClient.post<ApiEnvelope<FaceAnalysisResult>>(
      `${BASE}/${analysisRequestId}/result`,
      payload,
    ),
  )
}

/** 품질 미달로 끝났음을 기록. 사용자가 재촬영을 포기하고 건너뛸 때 부른다. */
export async function submitFaceAnalysisFailure(
  analysisRequestId: number,
  failureCode: FaceFailureCode,
): Promise<FaceAnalysisFailure> {
  return unwrap(
    await apiClient.post<ApiEnvelope<FaceAnalysisFailure>>(
      `${BASE}/${analysisRequestId}/failure`,
      { failureCode },
    ),
  )
}

/** 내 최신 얼굴상 결과. 아직 없으면 `null`. */
export async function getMyFaceAnalysis(): Promise<FaceAnalysisResult | null> {
  try {
    return unwrap(
      await apiClient.get<ApiEnvelope<FaceAnalysisResult>>('/v1/users/me/face-analysis'),
    )
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404) return null
    throw error
  }
}

/* ── AI 분석 서비스 ────────────────────────────────────── */

/**
 * AI 서비스 베이스. 비워두면 vite 프록시(`/ai/face`)를 탄다.
 * `??` 가 아니라 `||` — .env 에 빈 값이 들어와도 프록시 경로로 폴백해야 한다.
 */
const AI_BASE = import.meta.env.VITE_AI_FACE_BASE_URL || '/ai/face'

/** AI 서비스가 본문 없이 `{ errorCode }` 만 주는 오류. */
export class FaceAnalysisServiceError extends Error {
  // 생성자 파라미터 프로퍼티는 erasableSyntaxOnly 에서 금지라 필드를 따로 선언한다
  readonly errorCode: string
  readonly httpStatus: number

  constructor(errorCode: string, httpStatus: number) {
    super(errorCode)
    this.name = 'FaceAnalysisServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

/** AI 오류 코드 → 사용자 문구. */
export function describeFaceServiceError(error: unknown): string {
  if (!(error instanceof FaceAnalysisServiceError)) {
    return '분석 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
  switch (error.errorCode) {
    case 'INVALID_IMAGE':
      return '사진을 읽지 못했어요. 다시 촬영해 주세요.'
    case 'PAYLOAD_TOO_LARGE':
    case 'IMAGE_DIMENSIONS_TOO_LARGE':
      return '사진 용량이 너무 커요. 다시 촬영해 주세요.'
    case 'UNSUPPORTED_MEDIA_TYPE':
    case 'MEDIA_TYPE_MISMATCH':
      return '지원하지 않는 이미지 형식이에요. 다시 촬영해 주세요.'
    case 'MODEL_UNAVAILABLE':
      return '분석 서버가 준비 중이에요. 잠시 후 다시 시도하거나 건너뛸 수 있어요.'
    default:
      return '분석에 실패했어요. 잠시 후 다시 시도해 주세요.'
  }
}

/**
 * 이미지 분석 요청.
 *
 * ⚠️ Blob 을 **그대로** 본문에 싣는다 — Base64·multipart·JSON 을 쓰면 서버가 거부한다.
 * ⚠️ 미리보기는 좌우 반전해 보여주더라도, 여기에는 **반전하지 않은 원본**을 보낸다.
 * ⚠️ `apiClient` 를 쓰지 않는다. 베이스 URL 도 응답 래퍼도 백엔드와 다르다.
 */
export async function analyzeFace(
  image: Blob,
  analysisGroup: FaceAnalysisGroup,
): Promise<AiFaceAnalysis> {
  const response = await fetch(
    `${AI_BASE}/v1/face-analysis/analyze?analysis_group=${analysisGroup}`,
    {
      method: 'POST',
      headers: { 'Content-Type': image.type || 'image/jpeg' },
      body: image,
    },
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { errorCode?: string } | null
    throw new FaceAnalysisServiceError(body?.errorCode ?? 'UNKNOWN', response.status)
  }
  return (await response.json()) as AiFaceAnalysis
}
