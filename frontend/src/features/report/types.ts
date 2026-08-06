/**
 * AI 세션 리포트(REPORT · W-16 / `REPORT-01 · 01-1 · 02 · 04`) 도메인 타입 — 백엔드 계약과 1:1.
 *
 * 백엔드 SSOT: `SessionReportQueryController` + `report/dto/response/*`, enum 은 `report/domain/*`.
 *
 *   POST   /api/v1/sessions/{sessionId}/report            생성 재요청(202) — FAILED 일 때만
 *   GET    /api/v1/sessions/{sessionId}/report/status     상태 + reportId
 *   GET    /api/v1/sessions/{sessionId}/report            요약
 *   GET    /api/v1/reports/{reportId}                     상세
 *   GET    /api/v1/reports/{reportId}/analyses/{axisCode} 축 드릴다운
 *
 * ⚠️ **생성은 프론트가 걸지 않는다.** 세션 종료 이벤트(`AiSessionEndedEvent`)가 서버에서
 *    자동으로 요청한다. POST 는 실패한 리포트의 재시도 전용이고, `FAILED` 가 아닌 상태에서
 *    부르면 서버가 거절한다(`resetForRetry`).
 *
 * ⚠️ 원칙 1(연습이지 심사가 아니다): 등수·백분위·매력도 필드는 두지 않는다.
 *    점수는 **대화 행동**에만 붙고, 항상 근거와 함께 표시한다.
 */

/** 백엔드 `SessionReportStatus`. */
export type ReportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED'

/** 백엔드 `ReportGenerationMode`(NONE 등). 화면에서 분기하지 않아 문자열로 받는다. */
export type ReportGenerationMode = string

/**
 * AI 리포트 생성 서버가 설정되지 않았을 때의 실패 코드.
 *
 * ⚠️ 이건 "만들다 실패"가 아니라 **기능이 아직 연결되지 않음**이다.
 *    `ai.report.base-url`(env `AI_REPORT_BASE_URL`)이 비어 있으면 서버가 즉시 이 코드로
 *    FAILED 처리한다. 재시도해도 같은 결과라 **재시도 버튼을 보여주면 안 된다.**
 */
export const REPORT_NOT_CONFIGURED = 'AI_REPORT_NOT_CONFIGURED'

/* ── 레이더 축 ─────────────────────────────────────────── */

/** 축 코드 6종. 서버가 **소문자**로 내려주고 맵의 키가 된다. */
export type ReportAxisCode = 'flow' | 'question' | 'listening' | 'reaction' | 'balance' | 'nonverbal'

export const REPORT_AXIS_ORDER: readonly ReportAxisCode[] = [
  'flow',
  'question',
  'listening',
  'reaction',
  'balance',
  'nonverbal',
] as const

/** 축 표시명. 서버가 라벨을 주지 않아 프론트가 SSOT 다. */
export const REPORT_AXIS_LABEL: Readonly<Record<ReportAxisCode, string>> = {
  flow: '대화 흐름',
  question: '질문 균형',
  listening: '경청',
  reaction: '리액션',
  balance: '발화 균형',
  nonverbal: '비언어',
}

/** 축 점수 범위. 서버 검증이 `@DecimalMin("1.00") @DecimalMax("5.00")` 이다. */
export const AXIS_SCORE_MIN = 1
export const AXIS_SCORE_MAX = 5

/** 원시값 단위(백엔드 `AnalysisRawUnit`). */
export type AnalysisRawUnit = 'COUNT_PER_30_MINUTES' | 'RATIO' | 'MILLISECONDS' | 'COUNT'

/**
 * 레이더 축 1개(`ReportAxisResponse`).
 *
 * ⚠️ **상대 평가 점수(peerScore)가 없다.** 리포트는 AI 단독 분석이고, 상호 평가는
 *    `/evaluations` 로 별개 도메인에 있다. 두 점수를 겹쳐 그리던 화면은 성립하지 않는다.
 * ⚠️ `measured: false` 는 **측정하지 못한 축**이다(비전 미동의·데이터 부족).
 *    0점으로 그리면 "못했다"로 읽히므로 점수 대신 '측정 안 됨'으로 표기한다.
 */
export interface ReportAxis {
  /** 1.00~5.00. 미측정이면 null */
  score: number | null
  measured: boolean
  /** 원시 측정값 (예: 말 끊기 2.5회/30분) */
  raw: number | null
  rawUnit: AnalysisRawUnit | null
  /** 근거 한 줄 (예: "맞장구를 제외한 말 끊기 2회"). §15.3 설명가능성이 여기 있다 */
  note: string | null
}

/** 축 맵. 서버가 주지 않은 축은 키 자체가 없다. */
export type ReportAxes = Partial<Record<ReportAxisCode, ReportAxis>>

/* ── 지표 ──────────────────────────────────────────────── */

/** 분석 커버리지(`ReportCoverageResponse`). 0.0~1.0 */
export interface ReportCoverage {
  faceDetectionRate: number | null
  speechRecognitionRate: number | null
  cameraUptimeRate: number | null
}

/**
 * 행동 지표(`ReportMetricsResponse`).
 *
 * ⚠️ **표시 문구가 아니라 원시 수치**다. "68%" 같은 문자열은 프론트가 만든다.
 *    `visionMeasured` 가 false 면 표정·시선 지표 묶음을 통째로 감춘다 — 0 으로 그리면
 *    "한 번도 웃지 않았다"는 사실과 다른 말이 된다.
 */
export interface ReportMetrics {
  speakingMs: number | null
  speakingRatio: number | null
  longSilenceCount: number | null
  silenceThresholdMs: number | null
  interruptionCount: number | null
  backchannelCount: number | null
  fillerCount: number | null
  questionCount: number | null
  smileEpisodeCount: number | null
  gazeAwayCount: number | null
  faceMissingCount: number | null
  visionMeasured: boolean
  coverage: ReportCoverage | null
  fillerBreakdown: Record<string, number> | null
}

/* ── 근거 구간 ─────────────────────────────────────────── */

/** 근거 유형(백엔드 `AnalysisEvidenceType`). */
export type AnalysisEvidenceType =
  | 'LONG_SILENCE'
  | 'INTERRUPTION'
  | 'BACKCHANNEL'
  | 'GAZE_AWAY'
  | 'FACE_MISSING'
  | 'SMILE'

/** 근거 구간(`ReportEvidenceResponse`). */
export interface ReportEvidence {
  evidenceId: string
  eventType: AnalysisEvidenceType
  startMs: number
  endMs: number
  description: string | null
}

/* ── 응답 ──────────────────────────────────────────────── */

/** GET /sessions/{id}/report/status (`SessionReportStatusResponse`). */
export interface ReportStatusResponse {
  reportId: number | null
  sessionId: number
  status: ReportStatus
  failureCode: string | null
  failureReason: string | null
  requestedAt: string | null
  generatedAt: string | null
  updatedAt: string | null
}

/** GET /reports/{reportId} (`SessionReportDetailResponse`) — W-16 이 그리는 본체. */
export interface SessionReportDetail {
  reportId: number
  sessionId: number
  userId: number
  status: ReportStatus
  generationMode: ReportGenerationMode | null
  analysisVersion: string | null
  reportVersion: string | null
  axes: ReportAxes
  metrics: ReportMetrics | null
  summaryText: string | null
  strengths: string[]
  improvements: string[]
  /** 서버는 문자열 배열로 준다 — 미션 식별자가 없다 */
  nextMissions: string[]
  evidenceSegments: ReportEvidence[]
  failureCode: string | null
  failureReason: string | null
  attemptCount: number
  requestedAt: string | null
  generationStartedAt: string | null
  generatedAt: string | null
  updatedAt: string | null
}

/* ── 표시 도우미 ───────────────────────────────────────── */

/**
 * 1~5 점수를 레이더용 0~100 비율로. 미측정이면 null.
 *
 * 1점을 0% 로 깔지 않고 `score/5` 로 그린다 — "1점(최하)"과 "측정 없음"은 다른 상태이고,
 * 측정 없음은 축을 흐리게 그려 따로 구분한다.
 */
export function axisPercent(axis: ReportAxis | undefined): number | null {
  if (!axis || !axis.measured || axis.score == null) return null
  return Math.max(0, Math.min(100, (axis.score / AXIS_SCORE_MAX) * 100))
}

/** 원시값 표시 문구. 단위를 사람이 읽는 말로 바꾼다. */
export function formatRaw(raw: number | null, unit: AnalysisRawUnit | null): string | null {
  if (raw == null) return null
  switch (unit) {
    case 'COUNT_PER_30_MINUTES':
      return `30분당 ${round(raw, 1)}회`
    case 'RATIO':
      return `${Math.round(raw * 100)}%`
    case 'MILLISECONDS':
      return `${round(raw / 60_000, 1)}분`
    case 'COUNT':
      return `${round(raw, 0)}회`
    default:
      return String(round(raw, 1))
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
