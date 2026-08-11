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

/**
 * 응답이 JSON 이 아니었다. 프론트가 만든 코드로, AI 서비스가 보낸 코드가 아니다.
 *
 * 배포에서 `/ai/face/` 프록시가 없거나 죽으면 요청이 SPA 로 흘러 **index.html 이 200 으로**
 * 돌아온다. 그대로 `response.json()` 을 부르면 `SyntaxError: Unexpected token '<'` 이 나고,
 * 화면에는 분석 실패가 아니라 정체불명의 오류가 뜬다. 상태 코드만 보면 성공이라 더 헷갈린다.
 */
export const FACE_SERVICE_UNREACHABLE = 'SERVICE_UNREACHABLE'

/** JSON 응답으로 볼 수 있는지. `application/json`·`application/problem+json` 등을 받는다. */
function looksLikeJson(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return /\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(contentType)
}

/**
 * 본문을 JSON 으로 읽되 **던지지 않는다.** 못 읽으면 `null`.
 * content-type 이 맞아도 본문이 잘렸을 수 있어 파싱까지 해봐야 안다.
 */
async function readJsonSafely(response: Response): Promise<unknown> {
  if (!looksLikeJson(response)) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** AI 오류 코드 → 사용자 문구. */
export function describeFaceServiceError(error: unknown): string {
  if (!(error instanceof FaceAnalysisServiceError)) {
    return '분석 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
  switch (error.errorCode) {
    case FACE_SERVICE_UNREACHABLE:
      return '분석 서버에 연결하지 못했어요. 잠시 후 다시 시도하거나 건너뛸 수 있어요.'
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
    const body = (await readJsonSafely(response)) as { errorCode?: string } | null
    // 502·504 처럼 프록시가 만든 HTML 오류 페이지면 errorCode 가 없다 → 연결 실패로 본다.
    const code = body?.errorCode ?? (looksLikeJson(response) ? 'UNKNOWN' : FACE_SERVICE_UNREACHABLE)
    throw new FaceAnalysisServiceError(code, response.status)
  }

  // ⚠️ 200 이어도 우리 응답이라는 보장이 없다. SPA 폴백(index.html)·프록시 오류 페이지가
  //    200 으로 오면 여기서 걸러야 SyntaxError 대신 안내 문구가 뜬다.
  const payload = await readJsonSafely(response)
  if (payload === null || typeof payload !== 'object' || !('status' in payload)) {
    throw new FaceAnalysisServiceError(FACE_SERVICE_UNREACHABLE, response.status)
  }
  return payload as AiFaceAnalysis
}
