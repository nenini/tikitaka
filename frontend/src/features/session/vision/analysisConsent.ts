import { getMyConsents } from '@/features/consent/api'
import { updateAnalysisSettings } from '../api'

/**
 * 얼굴 촬영·분석 동의 여부.
 *
 * ⚠️ **이 값은 세션 입장을 막지 않는다.** 표정 분석을 켤지 말지만 정한다 —
 *    미동의 사용자도 화상 세션은 그대로 이용할 수 있어야 한다(선택 동의라서).
 *    예전에는 이 값을 보지 않고 `expressionAnalysisEnabled: true` 를 고정으로 보내,
 *    **동의하지 않은 사용자의 얼굴까지 분석**하고 있었다.
 *
 * 조회에 실패하면 `false` 다 — 모를 때 분석하는 쪽이 더 나쁜 실패다.
 */
async function hasFaceConsent(): Promise<boolean> {
  try {
    const consents = await getMyConsents()
    return consents.some((consent) => consent.code === 'FACE_CAPTURE_CONSENT' && consent.consented)
  } catch {
    return false
  }
}

/**
 * 세션별 표정·음성 분석 플래그 스냅샷.
 *
 * 기능명세서 v4 §3.3/§8: 표정·음성 분석 동의는 **가입 시 통합 필수 동의**에 포함되고,
 * 세션 화면에는 동의 상태를 노출하지 않는다. 대신 "세션 진입 시 1회 스냅샷"만 저장한다.
 *
 * ⚠️ 백엔드에 `GET /sessions/{id}/analysis-settings` 가 없다(PATCH 만 있고, 세션이
 *    IN_PROGRESS 가 되면 409 다). 그래서 대기방에서 입장할 때 받아온 PATCH 응답을
 *    sessionStorage 에 남긴다 — 세션 도중 새로고침해도 플래그가 살아남아야 하고,
 *    읽을 수 없을 때는 **분석하지 않는 쪽**(false)이 기본값이어야 한다.
 */

interface AnalysisSnapshot {
  readonly voiceAnalysisEnabled: boolean
  readonly expressionAnalysisEnabled: boolean
}

function storageKey(sessionId: number): string {
  return `bt.analysis-settings.${sessionId}`
}

function read(sessionId: number): AnalysisSnapshot | null {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const voice = Reflect.get(parsed, 'voiceAnalysisEnabled')
    const expression = Reflect.get(parsed, 'expressionAnalysisEnabled')
    if (typeof voice !== 'boolean' || typeof expression !== 'boolean') return null
    return { voiceAnalysisEnabled: voice, expressionAnalysisEnabled: expression }
  } catch {
    // 프라이빗 모드 등으로 sessionStorage 가 막힌 브라우저 — 분석을 끈 채로 진행한다.
    return null
  }
}

function write(sessionId: number, snapshot: AnalysisSnapshot): void {
  try {
    sessionStorage.setItem(storageKey(sessionId), JSON.stringify(snapshot))
  } catch {
    /* 저장 실패는 이번 탭에서 분석이 꺼지는 것 외에 영향이 없다 */
  }
}

/**
 * 세션 진입 직전에 1회 호출한다. 서버 응답이 이 세션의 확정 플래그다.
 *
 * 실패하면 이미 저장된 스냅샷을 그대로 두고 null 을 돌려준다 — 분석 설정 하나 때문에
 * 입장을 막지 않는다.
 */
export async function snapshotAnalysisSettings(
  sessionId: number,
): Promise<AnalysisSnapshot | null> {
  try {
    const expressionAnalysisEnabled = await hasFaceConsent()
    const settings = await updateAnalysisSettings(sessionId, {
      voiceAnalysisEnabled: true,
      expressionAnalysisEnabled,
    })
    const snapshot: AnalysisSnapshot = {
      voiceAnalysisEnabled: settings.voiceAnalysisEnabled,
      expressionAnalysisEnabled: settings.expressionAnalysisEnabled,
    }
    write(sessionId, snapshot)
    return snapshot
  } catch {
    return null
  }
}

/** 표정 분석(Vision) 사용 여부. 모르면 false — 모를 때 분석하는 쪽이 더 나쁜 실패다. */
export function isVisionEnabled(sessionId: number): boolean {
  return read(sessionId)?.expressionAnalysisEnabled ?? false
}

/** 세션이 끝나면 스냅샷도 남길 이유가 없다. */
export function clearAnalysisSnapshot(sessionId: number): void {
  try {
    sessionStorage.removeItem(storageKey(sessionId))
  } catch {
    /* 지우지 못해도 다음 세션은 다른 키를 쓴다 */
  }
}
