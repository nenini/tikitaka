import { apiClient } from '@/shared/api/client'
import type { ReportStatusResponse, SessionReport } from './types'

/**
 * AI 세션 리포트(REPORT) REST.
 *
 * 백엔드 미가동 시 데모 폴백을 돌려준다(매칭·챗봇과 동일 방침).
 * apiClient.baseURL 이 `/api` 이므로 여기서는 `/v1/...` 부터 적는다.
 *
 *   GET  /api/v1/sessions/{id}/reports/status     생성 상태(PENDING·GENERATING·COMPLETED·FAILED)
 *   GET  /api/v1/sessions/{id}/reports/me         내 세션 리포트 (W-16 본체)
 *   POST /api/v1/sessions/{id}/reports            생성 요청(FAILED 재시도)
 *
 * ⚠️ 명세에는 조각별 조회도 있다 —
 *   /reports/me/radar · /metrics · /strengths · /improvements · /next-missions ·
 *   /topics · /warnings · /filler-words · /issues/{issueId}
 * W-16 은 한 화면에 전부 그리므로 **`/reports/me` 하나가 위 조각을 모두 포함한다**고 가정했다
 * (엔드포인트 9번 호출 대신). 서버가 조각만 제공하면 이 파일에서 Promise.all 로 합치면 된다.
 */

const reportBase = (sessionId: string) => `/v1/sessions/${sessionId}/reports`

export async function getReportStatus(sessionId: string): Promise<ReportStatusResponse> {
  try {
    const { data } = await apiClient.get<ReportStatusResponse>(`${reportBase(sessionId)}/status`)
    return data
  } catch {
    return { reportStatus: 'COMPLETED', generatedAt: new Date().toISOString() }
  }
}

export async function getSessionReport(sessionId: string): Promise<SessionReport> {
  try {
    const { data } = await apiClient.get<SessionReport>(`${reportBase(sessionId)}/me`)
    return data
  } catch {
    return demoReport(sessionId)
  }
}

/** 생성 실패 시 재요청. 성공하면 상태가 GENERATING 으로 돌아간다. */
export async function requestReportGeneration(sessionId: string): Promise<void> {
  await apiClient.post(reportBase(sessionId))
}

/* ── 데모 폴백 ─────────────────────────────────────────── */

function demoReport(sessionId: string): SessionReport {
  return {
    sessionId,
    reportStatus: 'COMPLETED',
    sessionRoundNo: 6,
    sessionAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    opponentNickname: '유월',
    durationMin: 30,
    themeName: '저녁 식당',
    peerReviewIncluded: true,
    radar: [
      { key: 'flow', label: '대화 흐름', aiScore: 72, peerScore: 80 },
      { key: 'question', label: '질문 균형', aiScore: 58, peerScore: 68 },
      { key: 'listening', label: '경청', aiScore: 66, peerScore: 78 },
      { key: 'reaction', label: '리액션', aiScore: 84, peerScore: 92 },
      { key: 'manner', label: '매너', aiScore: 90, peerScore: 96 },
      { key: 'nonverbal', label: '비언어', aiScore: 74, peerScore: null },
    ],
    issues: [
      {
        issueId: 'demo-issue-1',
        categoryLabel: '결혼·출산 압박 표현',
        eventTimeSec: 754,
        contextSummary: '상대가 직장 이야기를 하던 중 결혼 계획으로 화제를 전환하셨어요.',
        evidenceExcerpt: '"…그럼 결혼은 언제쯤 하고 싶으세요?"',
        alternativeExpression: '앞으로 어떤 삶을 살고 싶은지 궁금해요',
      },
    ],
    metrics: [
      { key: 'speakingRatio', label: '본인 발화 비율', display: '68%' },
      { key: 'selfTopicShift', label: '자기 이야기 전환', display: '3회' },
      { key: 'openQuestionRatio', label: '확장 질문 비율', display: '35%' },
      { key: 'interruption', label: '말 끊기', display: '2회' },
      { key: 'fillerWordCount', label: '필러워드', display: '14' },
    ],
    strengths: [
      '상대 말을 요약해 되묻는 패턴이 4회 있었어요.',
      '미소 비율 42%로 안정적인 표정이 이어졌어요.',
      '매너 관련 감지 이슈가 없었어요.',
    ],
    improvements: [
      '발화 비율이 68%였어요. 조금 더 들어주면 균형에 가까워져요.',
      '취미 화제에서 자기 이야기로 전환한 구간이 3회 있었어요.',
    ],
    topics: [
      { label: '취미', minutes: 8 },
      { label: '일', minutes: 6 },
      { label: '여행', minutes: 4 },
      { label: '음식', minutes: 3 },
      { label: '가족', minutes: 2 },
    ],
    nextMissions: [
      { missionId: 'm1', label: '확장 질문 3회' },
      { missionId: 'm2', label: '발화 비율 55% 이하' },
    ],
    temperature: { before: 36.5, after: 38.2, delta: 1.7, reason: '세션 완료 · 상대 평가 반영' },
    summaryText: null,
    generatedAt: new Date().toISOString(),
  }
}
