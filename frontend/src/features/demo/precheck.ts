import { apiClient } from '@/shared/api/client'
import { unwrap, type ApiEnvelope } from '@/shared/api/envelope'
import { getCurrentMatch, getCurrentMatchRequest } from '@/features/matching/api'
import { isMatchClosed } from '@/features/matching/types'
import { getMyProfile } from '@/features/profile/api'
import { getMySurvey } from '@/features/survey/api'

/* -------------------------------------------------------------------------- */
/*  시연 사전 점검 (MVP 데모 전용)                                              */
/*                                                                            */
/*  "시작" 을 누르기 **전에** 막힐 지점을 찾아 알려준다.                        */
/*  발표 중에 매칭이 안 붙으면 원인이 큐인지·정책인지·권한인지 알 길이 없어      */
/*  그 자리에서 디버깅하게 된다. 그걸 미리 끝내는 화면이다.                      */
/* -------------------------------------------------------------------------- */

export type CheckStatus =
  /** 통과 */
  | 'ok'
  /** 진행은 되지만 알아야 할 것 */
  | 'warn'
  /** 이대로면 시연이 실패한다 */
  | 'blocked'
  /** 화면에서 확인할 방법이 없다 — 사람이 봐야 한다 */
  | 'unknown'

export interface CheckResult {
  id: string
  label: string
  status: CheckStatus
  detail: string
  /** 막혔을 때 무엇을 하면 되는지. 원인만 알려주고 끝내지 않는다. */
  fix?: string
}

/**
 * 대기방 입장 창(서버 `room.entry-open-before`). 예정 시각 **10분 전**부터 열린다.
 * 즉 세션이 지금보다 10분 넘게 미래로 잡히면, 매칭이 성립해도 대기방에 못 들어간다.
 */
const ROOM_ENTRY_OPEN_BEFORE_MIN = 10

interface MatchingPolicy {
  minimumAcceptanceWindowMinutes: number
  minimumPreparationMinutes: number
  recentMatchExclusionDays: number
}

/* ── 개별 점검 ─────────────────────────────────────────── */

/**
 * 보안 컨텍스트. **둘째 기기에서 가장 자주 걸리는 지점**이다 —
 * `http://192.168.x.x:5173` 으로 들어오면 `navigator.mediaDevices` 자체가 없어
 * 카메라가 열리지 않는다.
 */
export function checkSecureContext(): CheckResult {
  const secure = typeof window !== 'undefined' && window.isSecureContext
  const hasMediaDevices = Boolean(navigator.mediaDevices?.getUserMedia)

  if (secure && hasMediaDevices) {
    return {
      id: 'secure-context',
      label: '보안 연결',
      status: 'ok',
      detail: `${location.protocol}//${location.host} — 카메라를 열 수 있어요.`,
    }
  }
  return {
    id: 'secure-context',
    label: '보안 연결',
    status: 'blocked',
    detail: `${location.protocol}//${location.host} 는 보안 연결이 아니라 카메라가 열리지 않아요.`,
    fix: 'localhost 로 접속하거나, cloudflared 터널로 뽑은 https 주소를 쓰세요. (vite allowedHosts 에 .trycloudflare.com 이 이미 열려 있어요)',
  }
}

/**
 * 카메라·마이크 권한. Permissions API 는 브라우저마다 지원이 달라
 * 조회에 실패하면 `unknown` 으로 둔다 — 없는 정보를 있는 척하지 않는다.
 */
export async function checkMediaPermission(): Promise<CheckResult> {
  const base = { id: 'media-permission', label: '카메라 · 마이크 권한' } as const
  try {
    // 타입 정의에 'camera' 가 없는 브라우저가 있어 캐스팅한다(런타임에는 유효한 이름).
    const query = navigator.permissions?.query as
      | ((descriptor: { name: string }) => Promise<PermissionStatus>)
      | undefined
    if (!query) {
      return { ...base, status: 'unknown', detail: '이 브라우저는 권한 상태를 알려주지 않아요.', fix: '시작 후 권한 팝업이 뜨면 허용하세요.' }
    }
    const [camera, mic] = await Promise.all([
      query.call(navigator.permissions, { name: 'camera' }),
      query.call(navigator.permissions, { name: 'microphone' }),
    ])
    if (camera.state === 'denied' || mic.state === 'denied') {
      return {
        ...base,
        status: 'blocked',
        detail: `카메라 ${camera.state} · 마이크 ${mic.state}`,
        fix: '주소창 왼쪽 자물쇠 → 사이트 설정에서 카메라·마이크를 허용으로 바꾸세요.',
      }
    }
    if (camera.state === 'granted' && mic.state === 'granted') {
      return { ...base, status: 'ok', detail: '허용됨' }
    }
    return { ...base, status: 'warn', detail: '아직 묻지 않았어요. 시작하면 권한 팝업이 뜹니다.' }
  } catch {
    return { ...base, status: 'unknown', detail: '권한 상태를 확인하지 못했어요.' }
  }
}

/**
 * 매칭 자격. 서버가 프로필·설문 없이는 큐 등록을 409 로 막는다
 * (`MatchEligibilityPolicy` 는 프로필·생년월일까지 본다).
 */
export async function checkOnboarding(): Promise<CheckResult> {
  const base = { id: 'onboarding', label: '매칭 자격 (프로필 · 설문)' } as const
  try {
    const [profile, survey] = await Promise.all([
      getMyProfile().catch(() => null),
      getMySurvey().catch(() => null),
    ])
    if (!profile) {
      return { ...base, status: 'blocked', detail: '기본 프로필이 없어요.', fix: '온보딩(프로필 입력)을 먼저 마치세요.' }
    }
    if (!survey) {
      return { ...base, status: 'blocked', detail: '설문 응답이 없어요.', fix: '마이페이지 → 개인정보 관리에서 설문을 제출하세요.' }
    }
    return { ...base, status: 'ok', detail: `${profile.nickname} · ${profile.gender === 'FEMALE' ? '여성' : '남성'}` }
  } catch {
    return { ...base, status: 'unknown', detail: '자격을 확인하지 못했어요.' }
  }
}

/** 진행 중인 큐·매칭. 시작 시 자동 정리되므로 막지는 않는다. */
export async function checkPendingState(): Promise<CheckResult> {
  const base = { id: 'pending', label: '이전 큐 · 매칭' } as const
  try {
    const [queue, match] = await Promise.all([
      getCurrentMatchRequest().catch(() => null),
      getCurrentMatch().catch(() => null),
    ])
    const activeMatch = match && !isMatchClosed(match.status) ? match : null
    if (!queue && !activeMatch) return { ...base, status: 'ok', detail: '남아 있는 것 없음' }
    return {
      ...base,
      status: 'warn',
      detail: [queue && '대기 큐 있음', activeMatch && '진행 중 매칭 있음'].filter(Boolean).join(' · '),
      fix: '시작을 누르면 자동으로 정리돼요.',
    }
  } catch {
    return { ...base, status: 'unknown', detail: '상태를 확인하지 못했어요.' }
  }
}

/**
 * 서버 매칭 정책. **여기가 시연에서 가장 자주 막히는 지점**이다.
 *
 * 세션은 `지금 + 수락창 + 준비시간` 으로 잡히는데, 대기방은 예정 시각 10분 전부터
 * 열린다. 기본값(60+60=120분)이면 매칭이 붙어도 **110분간 대기방에 못 들어간다.**
 *
 * 정책 조회는 ADMIN 전용이라 시연 계정(USER)으로는 403 이다. 그때는 `unknown` 으로
 * 두고 확인 방법을 안내한다 — 못 읽었다고 통과로 표시하면 안 된다.
 */
export async function checkMatchingPolicy(): Promise<CheckResult> {
  const base = { id: 'policy', label: '매칭 정책 (세션 예정 시각)' } as const
  try {
    const policy = unwrap(
      await apiClient.get<ApiEnvelope<MatchingPolicy>>('/v1/admin/matching-policy'),
    )
    const delayMin = policy.minimumAcceptanceWindowMinutes + policy.minimumPreparationMinutes
    if (delayMin <= ROOM_ENTRY_OPEN_BEFORE_MIN) {
      return { ...base, status: 'ok', detail: `세션이 약 ${delayMin}분 뒤로 잡혀요 — 바로 입장 가능` }
    }
    return {
      ...base,
      status: 'blocked',
      detail: `세션이 약 ${delayMin}분 뒤로 잡혀 대기방이 ${delayMin - ROOM_ENTRY_OPEN_BEFORE_MIN}분간 열리지 않아요.`,
      fix: '관리자 계정으로 PATCH /api/v1/admin/matching-policy 에 {"minimumAcceptanceWindowMinutes":1,"minimumPreparationMinutes":0} 을 보내세요.',
    }
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 403 || status === 401) {
      return {
        ...base,
        status: 'unknown',
        detail: '시연 계정으로는 정책을 읽을 수 없어요(관리자 전용).',
        fix: '관리자 계정으로 GET /api/v1/admin/matching-policy 를 확인하세요. 수락창+준비시간 합이 10분 이하여야 바로 입장됩니다.',
      }
    }
    return { ...base, status: 'unknown', detail: '정책을 확인하지 못했어요.' }
  }
}

/**
 * 재매칭 쿨다운.
 *
 * ⚠️ **화면에서 확인할 방법이 없다.** 쿨다운 판정은 끝난 `match_pairs` 행의
 *    `recentMatchExclusionDaysSnapshot` 을 읽는데, 그 값을 내려주는 API 가 없다.
 *    게다가 스냅샷이라 관리자 API 로 정책을 낮춰도 **소급되지 않는다.**
 *
 * 그래서 자동 판정 대신 확인 방법을 적어 둔다 — 시연을 두 번째 돌릴 때 여기서
 * 막히는데, 증상은 "상대가 큐에 들어오지 않았어요" 라 원인을 짐작하기 어렵다.
 */
export function checkRematchCooldown(): CheckResult {
  return {
    id: 'cooldown',
    label: '재매칭 쿨다운 (2회차 시연)',
    status: 'unknown',
    detail: '같은 계정 쌍은 직전 세션 종료 후 일정 기간(기본 7일) 재매칭되지 않아요.',
    fix: '2회차 이상이면 DB 확인이 필요해요: SELECT matchPairId, completedAt, recentMatchExclusionDaysSnapshot FROM match_pairs ORDER BY matchPairId DESC LIMIT 3;',
  }
}

/* ── 전체 실행 ─────────────────────────────────────────── */

export async function runPrecheck(): Promise<CheckResult[]> {
  // 서로 독립이라 한 번에 돌린다. 하나가 느려도 나머지는 먼저 나온다.
  const [media, onboarding, pending, policy] = await Promise.all([
    checkMediaPermission(),
    checkOnboarding(),
    checkPendingState(),
    checkMatchingPolicy(),
  ])
  return [checkSecureContext(), media, onboarding, pending, policy, checkRematchCooldown()]
}

/** 하나라도 막혔는가. 시작 버튼을 잠글지 정한다. */
export function hasBlocker(results: readonly CheckResult[]): boolean {
  return results.some((r) => r.status === 'blocked')
}
