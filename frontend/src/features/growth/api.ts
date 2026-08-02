import { apiClient } from '@/shared/api/client'
import type { EarnedBadge, GrowthDashboard, GrowthKeyword, GrowthTrack, TemperaturePoint } from './types'

/**
 * 성장 대시보드(GROWTH) REST.
 *
 * 백엔드 미가동 시 데모 폴백을 돌려준다(매칭·챗봇과 동일 방침).
 * apiClient.baseURL 이 `/api` 이므로 여기서는 `/v1/...` 부터 적는다.
 *
 *   GET /api/v1/users/me/growth-dashboard              현재 온도·세션/노쇼/뱃지 스탯·온도 추이
 *   GET /api/v1/users/me/growth-keywords/strengths     누적 강점 키워드
 *   GET /api/v1/users/me/growth-keywords/improvements  누적 보완 키워드
 *   GET /api/v1/users/me/badges                        획득 뱃지
 *
 * ⚠️ 임의 구현: 명세의 growth-dashboard 에는 트랙 파라미터가 없다. 와이어플로우의
 *    `GET /api/growth/temperature-history?track=` 제안을 살려 `?track=` 을 함께 보내되,
 *    서버가 무시해도 화면이 동작하도록 **응답을 클라이언트에서 한 번 더 필터**한다.
 *    (추이 점은 sessionType 을 들고 있어 필터가 가능하다.)
 *
 * 미사용: /users/me/session-history · /users/me/growth-metrics?metric= 는 W-17 이 그리지 않는다.
 */

export async function getGrowthDashboard(track: GrowthTrack = 'ALL'): Promise<GrowthDashboard> {
  try {
    const { data } = await apiClient.get<GrowthDashboard>('/v1/users/me/growth-dashboard', {
      params: track === 'ALL' ? undefined : { track },
    })
    return data
  } catch {
    return demoDashboard()
  }
}

export async function getStrengthKeywords(): Promise<GrowthKeyword[]> {
  try {
    const { data } = await apiClient.get<GrowthKeyword[]>('/v1/users/me/growth-keywords/strengths')
    return data
  } catch {
    return [
      { label: '편안한 분위기', count: 5 },
      { label: '공감 표현', count: 4 },
      { label: '경청', count: 3 },
    ]
  }
}

export async function getImprovementKeywords(): Promise<GrowthKeyword[]> {
  try {
    const { data } = await apiClient.get<GrowthKeyword[]>('/v1/users/me/growth-keywords/improvements')
    return data
  } catch {
    return [
      { label: '자기 이야기 전환', count: 4 },
      { label: '빠른 말 속도', count: 2 },
    ]
  }
}

export async function getMyBadges(): Promise<EarnedBadge[]> {
  try {
    const { data } = await apiClient.get<EarnedBadge[]>('/v1/users/me/badges')
    return data
  } catch {
    // 코드는 badges.ts 의 아트 카탈로그와 맞춘다 — 아트가 없는 코드는 화면에 그려지지 않는다.
    return [
      {
        code: 'FIRST_CHAT',
        name: '첫 대화',
        condition: '첫 연습 세션을 끝까지 마쳤어요.',
        acquiredAt: daysAgo(30),
      },
      {
        code: 'GOOD_LISTENER',
        name: '경청왕',
        condition: '경청 지표가 세 세션 연속으로 올랐어요.',
        acquiredAt: daysAgo(12),
      },
      {
        code: 'AQUAMAN',
        name: '아쿠아맨',
        condition: '연락처 교환에 3번 실패했어요.',
        acquiredAt: daysAgo(6),
      },
    ]
  }
}

/* ── 데모 폴백 ─────────────────────────────────────────── */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function demoDashboard(): GrowthDashboard {
  const raw: Array<[number, TemperaturePoint['sessionType']]> = [
    [30.5, 'REAL'],
    [31.8, 'REAL'],
    [31.2, 'REAL'],
    [33.4, 'AI_VIDEO'],
    [34.6, 'REAL'],
    [34.1, 'REAL'],
    [36.5, 'AI_VIDEO'],
    [38.2, 'REAL'],
  ]
  const history: TemperaturePoint[] = raw.map(([temp, type], i) => ({
    sessionId: `demo-${i + 1}`,
    sessionNo: i + 1,
    sessionType: type,
    temperatureAfter: temp,
    delta: i === 0 ? temp - 30 : Number((temp - raw[i - 1][0]).toFixed(1)),
    createdAt: daysAgo((raw.length - i) * 4),
  }))

  return {
    currentTemperature: 38.2,
    recentDelta: 1.7,
    completedSessionCount: 8,
    realSessionCount: 6,
    aiSessionCount: 2,
    noShowCount: 0,
    badgeCount: 3,
    history,
  }
}
