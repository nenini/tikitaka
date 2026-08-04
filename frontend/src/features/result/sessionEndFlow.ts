import type { ReportStatus } from '@/features/report/types'
import type { EvaluationStatus } from './types'

/* -------------------------------------------------------------------------- */
/*  세션 종료 흐름 상태 머신 (RESULT-01/02)                                     */
/*                                                                            */
/*  종료 → 상호 평가 → 평가 상태 → 리포트 준비/대기 를 **한 곳에서 판정**한다.   */
/*  전에는 세션 화면이 무조건 /review 로 보내고, 평가 화면과 리포트 화면이       */
/*  서로의 상태를 몰랐다. 평가를 안 낸 채 리포트로 들어가거나, 리포트가 없는데   */
/*  '보기' 버튼이 열려 있는 일이 생긴다.                                        */
/*                                                                            */
/*  이 파일은 **의존성 없는 순수 모듈**이다 — 판정 규칙만 담고 fetch 하지 않는다.*/
/* -------------------------------------------------------------------------- */

export type SessionEndPhase =
  /** 내 평가를 아직 안 냈고, 낼 수 있다 */
  | 'evaluating'
  /** 미제출 상태로 마감이 지나 받은 평가를 영영 못 본다 */
  | 'locked'
  /** 내 제출 완료 · 상대 대기 */
  | 'waiting-peer'
  /** 양측 제출 완료 · 리포트 생성 중 */
  | 'report-pending'
  /** 리포트 완성 */
  | 'report-ready'
  /** 리포트 생성 실패 — 재시도 가능 */
  | 'report-failed'
  /** 서버에 리포트 기능 자체가 없다(엔드포인트 404) */
  | 'report-unavailable'

export interface SessionEndInput {
  /** `GET /evaluations/status`. 못 읽었으면 null. */
  evaluation: EvaluationStatus | null
  /**
   * `GET /reports/status` 의 `reportStatus`.
   * **null 은 '리포트 기능 없음'** 이다 — 백엔드에 엔드포인트가 아직 없어 404 가 온다.
   */
  reportStatus: ReportStatus | null
}

/**
 * 지금 사용자가 있어야 할 단계를 정한다.
 *
 * 순서가 규칙이다 — 앞 단계를 건너뛰고 뒤 단계로 갈 수 없다.
 * 평가 상태를 못 읽었으면 `evaluating` 으로 둔다. 평가 화면은 자체적으로
 * 오류·재시도를 그리므로, 판단이 안 될 때 보낼 곳으로 가장 안전하다.
 */
export function resolveSessionEndPhase({
  evaluation,
  reportStatus,
}: SessionEndInput): SessionEndPhase {
  if (evaluation == null) return 'evaluating'
  if (evaluation.resultPermanentlyLocked) return 'locked'
  if (!evaluation.mySubmitted) return 'evaluating'
  if (!evaluation.allSubmitted) return 'waiting-peer'

  // 여기부터는 평가가 끝났다 — 남은 건 리포트뿐이다.
  if (reportStatus == null) return 'report-unavailable'
  switch (reportStatus) {
    case 'COMPLETED':
      return 'report-ready'
    case 'FAILED':
      return 'report-failed'
    default:
      return 'report-pending'
  }
}

/**
 * 단계별 목적지.
 *
 * `report-unavailable` 은 리포트 화면으로 보내지 않는다 — 거기 가봐야
 * "리포트를 만들지 못했어요"만 뜨는데, 실패한 게 아니라 **기능이 아직 없는 것**이라
 * 사용자를 오해시킨다. 평가 결과를 볼 수 있는 화면에 머무는 편이 정확하다.
 */
export function destinationOf(phase: SessionEndPhase, sessionId: number | string): string {
  switch (phase) {
    case 'report-pending':
    case 'report-ready':
    case 'report-failed':
      return `/session/${sessionId}/report`
    default:
      return `/session/${sessionId}/review`
  }
}

/** 리포트 화면으로 넘어갈 수 있는 단계인가. '리포트 보기' 버튼의 활성 조건이다. */
export function canOpenReport(phase: SessionEndPhase): boolean {
  return phase === 'report-ready' || phase === 'report-pending' || phase === 'report-failed'
}

/** 단계별 안내 문구. 화면마다 다시 쓰지 않도록 한 곳에 둔다. */
export const PHASE_NOTICE: Readonly<Record<SessionEndPhase, string>> = {
  evaluating: '상대에 대한 평가를 남겨주세요.',
  locked: '평가를 내지 않아 상대의 평가를 볼 수 없어요.',
  'waiting-peer': '상대의 평가를 기다리고 있어요. 도착하면 알려드릴게요.',
  'report-pending': '리포트를 준비하고 있어요.',
  'report-ready': '리포트가 준비됐어요.',
  'report-failed': '리포트를 만들지 못했어요. 다시 시도할 수 있어요.',
  'report-unavailable': 'AI 리포트는 아직 준비 중인 기능이에요.',
}
