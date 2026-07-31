import type { VisionSessionFrameResult } from '@vision/vision/core/VisionSessionRuntime.js'

/**
 * 브라우저 콘솔로 Vision 파이프라인을 들여다보는 개발용 로거.
 *
 * AI 서버에 `vision.v4` 수신기가 아직 없어서, "브라우저가 실제로 감지하고 내보내고 있는가"를
 * 확인할 방법이 콘솔밖에 없다. 감지가 죽은 것인지 전송이 죽은 것인지 구분하는 게 목적이다.
 *
 *   행동 이벤트(미소·시선이탈·끄덕임 등)는 드물게 발생하므로 dev 에서 항상 찍는다.
 *   프레임 단위 지표는 초당 여러 번이라 아래 스위치를 켠 사람에게만 보여준다.
 *
 *     localStorage.setItem('bt.vision.debug', '1')   // 켜기 (새로고침 불필요)
 *     localStorage.removeItem('bt.vision.debug')     // 끄기
 */

const DEBUG_KEY = 'bt.vision.debug'

/** 상세 로그 스위치. 매번 읽어서 세션 도중에도 켜고 끌 수 있게 한다. */
function verbose(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1'
  } catch {
    return false
  }
}

function enabled(): boolean {
  return import.meta.env.DEV || verbose()
}

/** 상세 모드에서 요약 한 줄을 찍는 주기. 1초 스냅샷을 전부 찍으면 콘솔이 못 쓰게 된다. */
const SUMMARY_INTERVAL_MS = 5_000

export class VisionDebugLogger {
  private lastSummaryAtMs = 0
  private publishedBatches = 0
  private publishFailures = 0
  private behaviorCount = 0

  private readonly sessionId: number
  private readonly userId: string

  constructor(sessionId: number, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
  }

  start(detail: Record<string, unknown>): void {
    if (!enabled()) return
    console.info(
      `[vision] 시작 session=${this.sessionId} user=${this.userId}`,
      detail,
      verbose() ? '' : `(상세: localStorage.setItem('${DEBUG_KEY}','1'))`,
    )
  }

  /** 매 프레임 결과. 감지된 행동과 전송 성패를 여기서 갈라 본다. */
  frame(result: VisionSessionFrameResult): void {
    if (!enabled()) return

    for (const event of result.pipeline.behaviorEvents) {
      this.behaviorCount += 1
      // 이것이 "감지" 그 자체다 — AI 서버가 없어도 여기까지는 반드시 찍혀야 한다.
      console.info(
        `[vision] 감지 ${event.eventType} seq=${event.seq} ` +
          `t=${Math.round(event.sessionElapsedMs)}ms conf=${event.confidence.toFixed(2)}`,
        event.payload,
      )
    }

    if (result.publishFailed) {
      this.publishFailures += 1
      // 전송 실패는 버퍼에 남아 재시도된다. 계속 늘어나면 룸·신원 문제다.
      console.warn(`[vision] 전송 실패 누적 ${this.publishFailures}회 — 버퍼에 보관 후 재시도`)
    } else if (result.publishResult !== null) {
      this.publishedBatches += 1
    }

    if (!verbose()) return

    const nowMs = result.pipeline.metricSnapshot?.sessionElapsedMs ?? 0
    if (nowMs - this.lastSummaryAtMs < SUMMARY_INTERVAL_MS) return
    this.lastSummaryAtMs = nowMs

    const quality = result.pipeline.quality
    const calibration = result.pipeline.calibration
    console.info(
      `[vision] 상태 t=${Math.round(nowMs / 1000)}s ` +
        `품질=${quality.usable ? '사용가능' : '사용불가'}(${quality.confidence.toFixed(2)}) ` +
        `baseline=${calibration.baseline.status} ` +
        `프로파일=${result.performance.profile}@${result.performance.targetFps}fps ` +
        `감지누적=${this.behaviorCount} 배치=${this.publishedBatches} 실패=${this.publishFailures}`,
      quality.reasons.length > 0 ? { 품질사유: quality.reasons } : '',
    )
  }

  end(reason: string): void {
    if (!enabled()) return
    console.info(
      `[vision] 종료(${reason}) — 감지 ${this.behaviorCount}건 / 배치 ${this.publishedBatches}건 / ` +
        `전송실패 ${this.publishFailures}건`,
    )
  }
}
