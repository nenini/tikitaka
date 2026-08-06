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

/**
 * 축이 측정되지 않은 이유. 서버가 사유 코드를 주지 않아 화면이 안내 문구를 만든다.
 *
 * ⚠️ `question`(질문 균형)은 **데이터가 없어서가 아니라 판별 신뢰도가 부족해서** 미측정이다
 *    (활용 규약 §4 — STT 문장부호와 질문 의도 판별). "카메라를 껐다" 같은 다른 사유와
 *    같은 문구로 뭉뚱그리면 사용자가 자기 잘못으로 오해한다.
 */
export const AXIS_UNMEASURED_REASON: Readonly<Partial<Record<ReportAxisCode, string>>> = {
  question: '질문 판별 정확도가 아직 충분하지 않아 이번 리포트에서는 점수를 내지 않았어요.',
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

/* ── 문장 + 출처 ───────────────────────────────────────── */

/**
 * 문장의 출처 유형(활용 규약 §5·§6.2).
 *
 * 규약은 강점·개선점·미션을 `{ text, sourceType, sourceCode }` 구조로 전환하려 하고,
 * **문자열 배열은 호환 목적으로만 남긴다**고 못박았다. 서버가 아직 문자열을 주므로
 * 화면은 `narrativeItems()` 로 **양쪽을 모두 받는다** — 전환 시점에 화면을 다시 손대지 않는다.
 */
export type NarrativeSourceType =
  | 'MEASURED_AXIS'
  | 'SURVEY_GOAL'
  | 'MISSION_CATALOG'
  | 'ISSUE_PATTERN'
  | 'UTTERANCE_REF'

/** 서버가 줄 수 있는 형태 둘. 문자열은 과도기 호환이다. */
export type NarrativeInput =
  | string
  | { text?: string | null; sourceType?: string | null; sourceCode?: string | null }

/** 화면이 쓰는 정규화 형태. */
export interface NarrativeItem {
  text: string
  sourceType: NarrativeSourceType | null
  sourceCode: string | null
}

const SOURCE_TYPES: readonly string[] = [
  'MEASURED_AXIS',
  'SURVEY_GOAL',
  'MISSION_CATALOG',
  'ISSUE_PATTERN',
  'UTTERANCE_REF',
]

/**
 * 문자열/객체 혼재 배열 → `NarrativeItem[]`.
 *
 * 빈 문자열과 문자열 `'null'` 을 걸러낸다 — 규약 §6.1 이 서버 검증 항목으로 명시한 값이라
 * 새어 나올 수 있고, 화면에 그대로 그리면 "null" 이라는 조언이 뜬다.
 */
export function narrativeItems(input: readonly NarrativeInput[] | null | undefined): NarrativeItem[] {
  if (!input) return []
  const out: NarrativeItem[] = []
  for (const entry of input) {
    const raw = typeof entry === 'string' ? entry : (entry?.text ?? '')
    const text = raw.trim()
    if (text === '' || text === 'null' || text === 'undefined') continue
    const type = typeof entry === 'string' ? null : (entry?.sourceType ?? null)
    out.push({
      text,
      sourceType: type != null && SOURCE_TYPES.includes(type) ? (type as NarrativeSourceType) : null,
      sourceCode: typeof entry === 'string' ? null : (entry?.sourceCode ?? null),
    })
  }
  return out
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
  /**
   * 서버는 아직 **문자열 배열**을 준다. 규약 §5 가 `{ text, sourceType, sourceCode }` 로의
   * 전환을 예고했으므로 타입은 양쪽을 받고, 화면은 `narrativeItems()` 로 정규화해 쓴다.
   */
  strengths: NarrativeInput[]
  improvements: NarrativeInput[]
  nextMissions: NarrativeInput[]
  evidenceSegments: ReportEvidence[]
  failureCode: string | null
  failureReason: string | null
  attemptCount: number
  requestedAt: string | null
  generationStartedAt: string | null
  generatedAt: string | null
  updatedAt: string | null
}

/* ── 축 드릴다운 ───────────────────────────────────────── */

/** 축 관련 지표 1건(`ReportMetricItemResponse`). 코드와 단위는 서버가 정한다. */
export interface ReportMetricItem {
  code: string
  value: number | null
  unit: string | null
}

/**
 * GET /reports/{reportId}/analyses/{axisCode} (`ReportAxisDetailResponse`).
 *
 * 축 하나를 눌렀을 때 **그 축의 근거만** 모아서 준다. 리포트 본체의 `evidenceSegments` 는
 * 세션 전체 구간이라 "왜 경청이 3점인가"를 답하지 못한다.
 */
export interface ReportAxisDetail {
  reportId: number
  axisCode: string
  axis: ReportAxis
  relatedMetrics: ReportMetricItem[]
  evidenceSegments: ReportEvidence[]
}

/* ── 지난 리포트 목록 ──────────────────────────────────── */

/** 목록에 쓰는 세션 상태(백엔드 `GrowthSessionStatus`). */
export type SessionHistoryStatus = 'COMPLETED' | 'TERMINATED'

/** 항목의 리포트 유무(`GrowthSessionReportResponse`). */
export interface SessionHistoryReport {
  exists: boolean
  reportId: number | null
  status: ReportStatus | null
}

/** `GrowthSessionHistoryItemResponse`. */
export interface SessionHistoryItem {
  sessionId: number
  status: SessionHistoryStatus
  scheduledStartAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number
  /** 상대 표시명. 실명이 아니라 서버가 만든 별칭이다 */
  partnerAlias: string | null
  report: SessionHistoryReport | null
}

/** `GrowthSessionHistoryResponse` — 커서 페이지네이션. */
export interface SessionHistoryPage {
  sessions: SessionHistoryItem[]
  nextCursor: number | null
  hasNext: boolean
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

/**
 * 측정된 축 개수. 화면 문구가 "6축 점수"라고 단정하지 않도록 여기서 센다.
 *
 * 규약 §4: 외부 설명에는 "6축 점수"가 아니라
 * **"6축 분석 결과 — 현재 N개 축 측정, M개 축 측정 부족"** 을 쓴다.
 * 현재는 질문 균형이 상시 미측정이라 6축 전부에 점수가 붙는 일이 없다.
 */
export function measuredAxisCount(axes: ReportAxes): number {
  return REPORT_AXIS_ORDER.filter((code) => {
    const axis = axes[code]
    return Boolean(axis?.measured) && axis?.score != null
  }).length
}

/**
 * 발화 균형 판정 임곗값(활용 규약 §10 — 55/45 에서 **65/35 로 조정**됐다).
 *
 * ⚠️ 이 값을 바꾸면 규약 문서와 백엔드 기준도 함께 바꿔야 한다. 규약 §4 가
 *    "동일한 지표는 실시간 코칭·배치 리포트·프롬프트·화면 설명에서 같은 기준"을 요구한다.
 */
export const SPEAKING_RATIO_HIGH = 0.65
export const SPEAKING_RATIO_LOW = 0.35

export type SpeakingBalance = 'DOMINANT' | 'BALANCED' | 'QUIET'

/**
 * 발화 비율 → 균형 상태.
 *
 * 문구는 평가가 아니라 **관찰**로 적는다(§5 규칙 5 — 인격이 아닌 관찰 가능한 행동).
 * "말이 너무 많았어요"가 아니라 "내가 더 많이 말했어요"다.
 */
export function speakingBalanceOf(ratio: number | null): SpeakingBalance | null {
  if (ratio == null) return null
  if (ratio >= SPEAKING_RATIO_HIGH) return 'DOMINANT'
  if (ratio <= SPEAKING_RATIO_LOW) return 'QUIET'
  return 'BALANCED'
}

export const SPEAKING_BALANCE_LABEL: Readonly<Record<SpeakingBalance, string>> = {
  DOMINANT: '내가 더 많이',
  BALANCED: '비슷하게',
  QUIET: '상대가 더 많이',
}

/**
 * 긴 침묵 라벨. **기준 초는 서버 값(`silenceThresholdMs`)에서 읽는다.**
 *
 * ⚠️ 하드코딩 금지. 규약 §10 이 "코드는 10초로 통일했으나 레이아웃 문서에 15초가 남아 있어
 *    FE 가 그 문서를 보고 라벨을 만들면 다시 어긋난다"고 경고한 바로 그 지점이다.
 *    서버가 값을 주지 않으면 초를 적지 않는다 — 틀린 숫자보다 없는 편이 낫다.
 */
export function silenceLabel(thresholdMs: number | null): string {
  if (thresholdMs == null || thresholdMs <= 0) return '긴 침묵'
  return `${Math.round(thresholdMs / 1000)}초+ 침묵`
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
