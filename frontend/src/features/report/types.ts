/**
 * AI 세션 리포트(REPORT · W-16 / `REPORT-01 · 01-1 · 02 · 04`) 도메인 타입.
 * ERD `session_reports` · `session_metric_summaries` · `safety_events` ·
 * `peer_evaluations` · `love_temperature_histories` 기준.
 *
 * ⚠️ 원칙 1(연습이지 심사가 아니다): 등수·백분위·매력도 필드는 두지 않는다.
 *    점수는 **대화 행동**에만 붙고, 항상 근거 지표와 함께 표시한다.
 */

/** 리포트 생성 상태. 상대 평가를 최대 48h 대기한 뒤 **한 번만** 확정 생성된다. */
export type ReportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED'

/** GET /sessions/{id}/reports/status */
export interface ReportStatusResponse {
  reportStatus: ReportStatus
  /** 상대 평가 대기 마감(ISO). PENDING 안내에 쓴다 */
  peerReviewDeadlineAt?: string | null
  generatedAt?: string | null
}

/**
 * 레이더 축 1개. 축 구성(대화 흐름·질문 균형·경청·리액션·매너·비언어)은 서버가 정한다 —
 * AI 6축과 상대 평가 6항목의 대응이 1:1이 아니라서 클라이언트가 매핑하지 않는다.
 */
export interface RadarAxis {
  key: string
  label: string
  /** AI 분석 0~100 */
  aiScore: number
  /** 상대 평가 0~100. 48h 미제출로 AI 단독 확정이면 null */
  peerScore: number | null
}

/**
 * 이슈 심각도(safety_events.severity).
 * 모든 이슈를 같은 노랑으로 그리면 "말버릇 한 번"과 "반복된 압박 발언"이 같은 무게로 보인다.
 * 서버가 값을 주지 않으면 `warning` 으로 취급한다.
 */
export type IssueSeverity = 'info' | 'warning' | 'critical'

/** 부적절 이슈 맥락(safety_events). 발언 나열이 아니라 **맥락 요약 + 근거 + 대체 제안** 형식. */
export interface ReportIssue {
  issueId: string
  /** 감지 유형 표시명 (예: "결혼·출산 압박 표현") */
  categoryLabel: string
  /** 심각도. 미지정이면 warning */
  severity?: IssueSeverity | null
  /** 세션 시작 기준 감지 시각(초) */
  eventTimeSec: number
  contextSummary: string
  /** 전후 3~4문장 근거 발언. STT 발췌 미동의(D-20) 시 null 일 수 있다 */
  evidenceExcerpt?: string | null
  alternativeExpression?: string | null
}

/** 행동 근거 지표(session_metric_summaries). 값은 서버가 이미 표시용으로 계산해 내려준다. */
export interface ReportMetric {
  key: string
  label: string
  /** 표시값 (예: "68%", "3회", "14") */
  display: string
}

/** 대화 주제 시각화(topicSummaryJson). */
export interface ReportTopic {
  label: string
  minutes: number
}

/** 다음 세션 미션(nextMissionsJson). */
export interface ReportMission {
  missionId: string
  label: string
}

/** 온도 증감(love_temperature_histories). */
export interface TemperatureDelta {
  before: number
  after: number
  delta: number
  reason?: string | null
}

/** GET /sessions/{id}/reports/me — W-16 이 그리는 전체 묶음. */
export interface SessionReport {
  sessionId: string
  reportStatus: ReportStatus
  /** 몇 회차 세션인지 */
  sessionRoundNo: number
  /** 세션 시각(ISO) */
  sessionAt: string
  opponentNickname: string
  durationMin: number
  themeName?: string | null
  /** 상대 평가가 반영됐는가. false = 48h 초과로 AI 단독 확정 */
  peerReviewIncluded: boolean
  radar: RadarAxis[]
  issues: ReportIssue[]
  metrics: ReportMetric[]
  /** 잘한 점 3 · 개선점 2 (§15.4). 리포트의 뼈대는 이쪽이다(D-14) */
  strengths: string[]
  improvements: string[]
  topics: ReportTopic[]
  nextMissions: ReportMission[]
  temperature: TemperatureDelta | null
  summaryText?: string | null
  generatedAt?: string | null
}
