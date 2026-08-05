/**
 * 얼굴상 분석(FACE · W-05 / `PROFILE-02`) 도메인 타입.
 *
 * 이 기능은 **서비스가 두 개**다. 원본 이미지는 백엔드를 거치지 않는다.
 *
 *   1) AI 분석 서비스 (`ai/face-analysis`, FastAPI) — 이미지 → 얼굴상 태그
 *      POST /v1/face-analysis/analyze?analysis_group=female   (본문: 이미지 바이트)
 *   2) 백엔드 (`FaceController`) — 분석 *결과*만 저장
 *      POST /api/v1/face-analyses                     분석 요청 생성 → analysisRequestId
 *      POST /api/v1/face-analyses/{id}/result         성공 결과 저장
 *      POST /api/v1/face-analyses/{id}/failure        품질 미달 기록
 *      GET  /api/v1/users/me/face-analysis            최신 결과 조회
 *
 * 🔒 원본 이미지·크롭·랜드마크·임베딩은 백엔드로 보내지 않는다(기능명세 §22).
 */

/** 저장 코드 10종(백엔드 `FaceType` = AI `FaceTypeCode`). */
export type FaceTypeCode =
  | 'DOG'
  | 'CAT'
  | 'RABBIT'
  | 'FOX'
  | 'DEER'
  | 'TURTLE'
  | 'HAMSTER'
  | 'SNAKE'
  | 'DINOSAUR'
  | 'WOLF'

/**
 * 품질 미달 사유(백엔드 `FaceAnalysisFailureCode`).
 * AI 의 `quality.reasons` 와 **같은 어휘**라 그대로 넘길 수 있다
 * (`ai/face-analysis` 의 QUALITY_REASON_CODES 표와 1:1).
 */
export type FaceFailureCode =
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'LOW_LIGHT'
  | 'OVEREXPOSED'
  | 'SEVERE_BLUR'
  | 'EXTREME_HEAD_POSE'
  | 'INVALID_IMAGE'

/**
 * 1순위 얼굴상 한 줄 설명.
 *
 * ⚠️ **프론트 임시 문구다.** 서버 `face_tag_catalog.description` 이 전부 NULL 이라
 *    내려줄 설명이 없다(`V5__add_survey_schema_and_catalog.sql` 시드 확인).
 *    카탈로그에 설명이 채워지면 이 표를 지우고 서버 값을 쓴다.
 *    TODO(FACE): 기획 확정 문구로 교체하거나 백엔드 카탈로그로 이관.
 *
 * 외모를 평가하지 않고 **첫인상의 분위기**만 적는다 — 결과는 재미 요소이자
 * 매칭 참고 정보일 뿐이라는 화면 문구(`ENTERTAINMENT_ONLY`)와 톤을 맞춘다.
 */
export const FACE_TYPE_DESCRIPTION: Readonly<Record<FaceTypeCode, string>> = {
  DOG: '보고 있으면 마음이 놓이는, 다가가기 쉬운 인상이에요.',
  CAT: '또렷한 눈매가 먼저 눈에 들어오는 인상이에요.',
  RABBIT: '동그란 느낌이 도드라지는 부드러운 인상이에요.',
  FOX: '차분하면서도 시선을 붙드는 인상이에요.',
  DEER: '맑고 잔잔한 분위기가 먼저 느껴지는 인상이에요.',
  TURTLE: '서두르지 않는 편안한 분위기의 인상이에요.',
  HAMSTER: '작고 동글동글한 인상이 오래 기억에 남아요.',
  SNAKE: '분위기가 또렷하게 남는, 인상이 강한 얼굴이에요.',
  DINOSAUR: '개성이 뚜렷해 쉽게 잊히지 않는 인상이에요.',
  WOLF: '선이 또렷하고 분위기가 뚜렷한 인상이에요.',
}

/** 품질 미달 사유별 사용자 안내. 무엇을 바꿔야 하는지까지 적는다. */
export const FACE_FAILURE_GUIDE: Readonly<Record<FaceFailureCode, string>> = {
  NO_FACE: '얼굴이 보이지 않아요. 화면 안내선 안에 얼굴을 맞춰주세요.',
  MULTIPLE_FACES: '여러 사람이 함께 찍혔어요. 혼자 나오도록 다시 찍어주세요.',
  LOW_LIGHT: '너무 어두워요. 밝은 곳에서 정면으로 빛을 받아주세요.',
  OVEREXPOSED: '빛이 너무 강해요. 역광을 피하고 조명을 낮춰주세요.',
  SEVERE_BLUR: '사진이 흔들렸어요. 기기를 고정하고 다시 찍어주세요.',
  EXTREME_HEAD_POSE: '고개가 많이 기울었어요. 정면을 봐주세요.',
  INVALID_IMAGE: '사진을 읽지 못했어요. 다시 촬영해 주세요.',
}

/** 분석 그룹. 사용자가 고르거나 프로필 성별에서 정한다 — AI 가 추론하지 않는다. */
export type FaceAnalysisGroup = 'female' | 'male'

/* ── AI 서비스 응답 ────────────────────────────────────── */

export interface AiFaceTag {
  code: FaceTypeCode
  displayName: string
  rank: number
  /** 0.0~1.0 */
  relativeScore: number
}

export interface AiFaceQuality {
  usable: boolean
  reasons: FaceFailureCode[]
  faceCount: number
  faceAreaRatio: number | null
  brightnessScore: number | null
  blurScore: number | null
  rollDegrees: number | null
}

/**
 * POST /v1/face-analysis/analyze 응답.
 * `RETAKE_REQUIRED` 면 `tags` 가 비어 있고 `quality.reasons` 에 사유가 담긴다.
 * `UNCERTAIN` 은 확신이 낮을 뿐 태그는 있으므로 저장한다.
 */
export interface AiFaceAnalysis {
  schemaVersion: number
  status: 'SUCCESS' | 'UNCERTAIN' | 'RETAKE_REQUIRED'
  modelVersion: string
  analysisGroup: FaceAnalysisGroup | null
  quality: AiFaceQuality
  tags: AiFaceTag[]
  noticeCode: 'ENTERTAINMENT_ONLY'
}

/* ── 백엔드 계약 ───────────────────────────────────────── */

export type FaceAnalysisStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'

/** POST /api/v1/face-analyses (FaceAnalysisRequestResponse). */
export interface FaceAnalysisRequest {
  analysisRequestId: number
  status: FaceAnalysisStatus
}

/**
 * POST /api/v1/face-analyses/{id}/result 본문(FaceAnalysisResultSubmitRequest).
 * `tags` 는 1~10개, `relativeScore` 는 0.0~1.0 소수 6자리, `rank` 는 1~10.
 */
export interface FaceResultSubmitPayload {
  modelVersion: string
  tags: { code: FaceTypeCode; relativeScore: number; rank: number }[]
}

export interface FaceResultTag {
  code: FaceTypeCode
  displayName: string
  rank: number
  relativeScore: number
}

/** POST .../result · GET /users/me/face-analysis (FaceAnalysisResultResponse). */
export interface FaceAnalysisResult {
  analysisRequestId: number
  status: FaceAnalysisStatus
  primaryType: FaceTypeCode
  primaryTypeDisplayName: string
  modelVersion: string
  tags: FaceResultTag[]
  analyzedAt: string
}

/** POST .../failure 응답(FaceAnalysisFailureResponse). */
export interface FaceAnalysisFailure {
  analysisRequestId: number
  status: FaceAnalysisStatus
  failureCode: FaceFailureCode
  analyzedAt?: string
  failedAt: string
}

/* ── 촬영 규칙 ─────────────────────────────────────────── */

/** AI 서비스 권장 상한. 이보다 크면 리사이즈해서 보낸다. */
export const CAPTURE_MAX_WIDTH = 1600

/** JPEG 인코딩 품질. 너무 낮추면 블러 판정이 뜬다. */
export const CAPTURE_JPEG_QUALITY = 0.92

/** 이 횟수를 넘겨 실패하면 건너뛰기를 전면에 안내한다(기능명세 §4.2). */
export const RETAKE_LIMIT = 3
