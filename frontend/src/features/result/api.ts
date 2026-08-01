import { apiClient } from '@/shared/api/client'
import {
  FALLBACK_REPORT_TYPES,
  PEER_REVIEW_METRICS,
} from './types'
import type {
  PeerReviewForm,
  PeerReviewSubmission,
  ReceivedReview,
  ReceivedReviewStatus,
  ReportTypeOption,
} from './types'

/**
 * 상호 평가(RESULT) + 신고·차단(MODERATION) REST.
 *
 * 백엔드 미가동 시 데모 폴백을 돌려준다(매칭·챗봇과 동일 방침). 실서버가 붙으면 폴백은 안 쓰인다.
 * apiClient.baseURL 이 `/api` 이므로 여기서는 `/v1/...` 부터 적는다.
 *
 *   GET    /api/v1/sessions/{id}/peer-review-form                     평가 항목·상대·마감 조회
 *   POST   /api/v1/sessions/{id}/peer-reviews                         상대 행동 평가 제출
 *   GET    /api/v1/sessions/{id}/peer-reviews/submitted               내가 작성한 평가 조회
 *   GET    /api/v1/sessions/{id}/peer-reviews/received/status         상호성 게이트 상태
 *   GET    /api/v1/sessions/{id}/peer-reviews/received                나에 대한 평가(게이트 통과 시)
 *   POST   /api/v1/sessions/{id}/peer-reviews/{reviewId}/report       평가 내용 신고
 *   GET    /api/v1/report-types                                       신고 유형 목록
 *   POST   /api/v1/sessions/{id}/reports                              세션 상대 신고
 *   POST   /api/v1/users/{userId}/block                               사용자 차단
 */

const sessionBase = (sessionId: string) => `/v1/sessions/${sessionId}`

/* ── 평가 폼 ───────────────────────────────────────────── */

export async function getPeerReviewForm(sessionId: string): Promise<PeerReviewForm> {
  try {
    const { data } = await apiClient.get<PeerReviewForm>(`${sessionBase(sessionId)}/peer-review-form`)
    // 서버가 metrics 를 생략하면 ERD 고정 6항목으로 채운다
    return { ...data, metrics: data.metrics?.length ? data.metrics : [...PEER_REVIEW_METRICS] }
  } catch {
    return {
      sessionId,
      opponent: { userId: 'demo-opponent', nickname: '유월' },
      sessionRoundNo: 6,
      durationMin: 30,
      metrics: [...PEER_REVIEW_METRICS],
      submitDeadlineAt: new Date(Date.now() + 41 * 3600_000).toISOString(),
      submitted: false,
    }
  }
}

/** 제출. 서버는 세션 참여자·중복 제출·48h 마감을 검증한다. */
export async function submitPeerReview(
  sessionId: string,
  body: PeerReviewSubmission,
): Promise<void> {
  await apiClient.post(`${sessionBase(sessionId)}/peer-reviews`, body)
}

/** 내가 작성한 평가(제출 후 되돌아왔을 때 읽기 전용으로 보여준다). */
export async function getSubmittedReview(sessionId: string): Promise<ReceivedReview | null> {
  try {
    const { data } = await apiClient.get<ReceivedReview | null>(
      `${sessionBase(sessionId)}/peer-reviews/submitted`,
    )
    return data ?? null
  } catch {
    return null
  }
}

/* ── 상호성 게이트 ─────────────────────────────────────── */

export async function getReceivedStatus(sessionId: string): Promise<ReceivedReviewStatus> {
  const deadlineAt = new Date(Date.now() + 41 * 3600_000).toISOString()
  try {
    const { data } = await apiClient.get<ReceivedReviewStatus>(
      `${sessionBase(sessionId)}/peer-reviews/received/status`,
    )
    return data
  } catch {
    return {
      mySubmitted: false,
      opponentSubmitted: true,
      unlocked: false,
      deadlineAt,
      expired: false,
    }
  }
}

/**
 * 나에 대한 평가. 게이트를 통과하지 못하면 서버가 403 을 준다 —
 * 화면에서 감추는 것과 별개로 여기서도 null 로 흘려보낸다.
 */
export async function getReceivedReview(sessionId: string): Promise<ReceivedReview | null> {
  try {
    const { data } = await apiClient.get<ReceivedReview | null>(
      `${sessionBase(sessionId)}/peer-reviews/received`,
    )
    return data ?? null
  } catch {
    return null
  }
}

/** 받은 평가의 내용이 부적절할 때(욕설 등) 신고. */
export async function reportReview(
  sessionId: string,
  reviewId: string,
  body: { reportTypeCode: string; detail?: string },
): Promise<void> {
  await apiClient.post(`${sessionBase(sessionId)}/peer-reviews/${reviewId}/report`, body)
}

/* ── 신고 · 차단(MODERATION) ───────────────────────────── */

export async function getReportTypes(): Promise<ReportTypeOption[]> {
  try {
    const { data } = await apiClient.get<ReportTypeOption[]>('/v1/report-types')
    return data?.length ? data : [...FALLBACK_REPORT_TYPES]
  } catch {
    return [...FALLBACK_REPORT_TYPES]
  }
}

export async function reportSessionUser(
  sessionId: string,
  body: { reportTypeCode: string; detail?: string },
): Promise<void> {
  await apiClient.post(`${sessionBase(sessionId)}/reports`, body)
}

export async function blockUser(userId: string): Promise<void> {
  await apiClient.post(`/v1/users/${userId}/block`)
}
