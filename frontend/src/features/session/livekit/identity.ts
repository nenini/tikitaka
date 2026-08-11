/**
 * LiveKit participant identity 규칙. 백엔드가 발급하는 값과 1:1로 맞춘다.
 *
 *  - 사람:      `user-{userId}`        (`RoomParticipant.identityOf`)
 *  - AI 워커:   `ai-session-{sessionId}` (`LiveKitAiWorkerTokenIssuer.IDENTITY_PREFIX`)
 *
 * 룸에는 사람 2명 외에 AI 워커도 들어온다. "원격 참가자가 있다 = 상대가 들어왔다" 로
 * 판단하면 상대가 아직 없는데도 입장한 것으로 보이므로, 참가자 수를 세는 모든 곳에서
 * AI 워커를 빼야 한다.
 */

export const AI_WORKER_IDENTITY_PREFIX = 'ai-session-'
export const USER_IDENTITY_PREFIX = 'user-'

/** 백엔드 `LiveKitAiWorkerTokenIssuer` 와 같은 규칙. */
export function aiWorkerIdentityOf(sessionId: string): string {
  return `${AI_WORKER_IDENTITY_PREFIX}${sessionId}`
}

/** 백엔드 `RoomParticipant.identityOf` 와 같은 규칙. */
export function participantIdentityOf(userId: string): string {
  return `${USER_IDENTITY_PREFIX}${userId}`
}

/** AI 분석 워커인가. 사람 수를 셀 때는 반드시 제외한다. */
export function isAiWorkerIdentity(identity: string | undefined): boolean {
  return identity !== undefined && identity.startsWith(AI_WORKER_IDENTITY_PREFIX)
}
