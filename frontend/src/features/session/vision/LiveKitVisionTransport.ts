import { ConnectionState, type Room } from 'livekit-client'
import type {
  VisionBehaviorEvent,
  VisionMetricSnapshot,
} from '@vision/vision/events/VisionEvent.js'
import type {
  VisionEventBatch,
  VisionEventTransport,
} from '@vision/vision/events/VisionEventPublisher.js'
import { aiWorkerIdentityOf, participantIdentityOf } from '../livekit/identity'

export { aiWorkerIdentityOf, participantIdentityOf }

/** AI 파트와 합의한 DataChannel topic. 이 topic 의 페이로드는 Vision v4 배치 뿐이다. */
export const VISION_V4_TOPIC = 'vision.v4'

/**
 * LiveKit DataChannel 한 패킷의 안전 상한(byte).
 *
 * SFU 의 reliable 패킷 상한은 15KiB 근처다. 헤더·인코딩 여유를 빼고 12KB 를 넘기면
 * 배치를 쪼갠다. 메트릭 스냅샷 하나가 2~3KB 라 보통은 쪼갤 일이 없지만,
 * 전송이 한 번 실패해 버퍼가 쌓인 뒤의 flush 에서는 반드시 걸린다.
 */
const MAX_PACKET_BYTES = 12_000

export interface LiveKitVisionTransportOptions {
  readonly room: Room
  /** 이 브라우저가 분석 중인 세션. 배치 안의 모든 이벤트가 이 값이어야 한다. */
  readonly sessionId: string
  /** 현재 로그인 사용자. 배치 안의 모든 이벤트가 이 값이어야 한다. */
  readonly userId: string
  /** 내 LiveKit participant identity. 실제 localParticipant 와 다르면 보내지 않는다. */
  readonly participantIdentity: string
  /** 수신자. 비워두면 상대 참가자에게도 내 얼굴 분석이 흘러가므로 반드시 채운다. */
  readonly aiParticipantIdentity: string
  readonly topic?: string
  readonly maxPacketBytes?: number
}

export type VisionTransportRejectionReason =
  | 'ROOM_DISCONNECTED'
  | 'AI_WORKER_NOT_CONNECTED'
  | 'IDENTITY_MISMATCH'
  | 'SESSION_MISMATCH'
  | 'USER_MISMATCH'
  | 'ABORTED'

/** 전송 전 계약 위반을 잡아낸다. 던지면 publisher 가 배치를 버퍼에 되돌린다. */
export class VisionTransportRejection extends Error {
  readonly reason: VisionTransportRejectionReason

  constructor(reason: VisionTransportRejectionReason, message: string) {
    super(message)
    this.name = 'VisionTransportRejection'
    this.reason = reason
  }
}

/**
 * Vision v4 배치를 LiveKit DataChannel(`vision.v4`, Reliable)로 내보낸다.
 *
 * 설계 규칙
 *  - **AI 워커에게만** 보낸다(`destinationIdentities`). 브로드캐스트하면 상대방 브라우저가
 *    내 표정 지표를 그대로 받는다 — 최소 공개 원칙 위반이자 되돌릴 수 없는 유출이다.
 *  - 페이로드는 `{behaviorEvents, metricSnapshots}` **그대로**다. Aggregator 의
 *    `VisionEventBatch`(pydantic, `extra="forbid"`)가 이 모양만 통과시키므로
 *    participantIdentity 같은 필드를 위에 얹으면 서버에서 통째로 거절된다.
 *    참가자 신원은 수신 측이 LiveKit 패킷의 발신 participant 에서 읽는다.
 *  - 그래서 신원 일치는 **보내기 전에 여기서** 검증한다. 어긋나면 전송하지 않는다.
 */
export class LiveKitVisionTransport implements VisionEventTransport {
  private readonly options: LiveKitVisionTransportOptions
  private readonly topic: string
  private readonly maxPacketBytes: number
  private readonly encoder = new TextEncoder()

  constructor(options: LiveKitVisionTransportOptions) {
    this.options = options
    this.topic = options.topic ?? VISION_V4_TOPIC
    this.maxPacketBytes = options.maxPacketBytes ?? MAX_PACKET_BYTES
  }

  async send(batch: VisionEventBatch, signal: AbortSignal): Promise<void> {
    this.assertSendable(batch, signal)

    for (const packet of this.split(batch)) {
      if (signal.aborted) {
        throw new VisionTransportRejection('ABORTED', 'Vision 전송이 중단되었습니다.')
      }
      await this.options.room.localParticipant.publishData(this.encode(packet), {
        reliable: true,
        topic: this.topic,
        destinationIdentities: [this.options.aiParticipantIdentity],
      })
    }
  }

  private assertSendable(batch: VisionEventBatch, signal: AbortSignal): void {
    if (signal.aborted) {
      throw new VisionTransportRejection('ABORTED', 'Vision 전송이 중단되었습니다.')
    }

    const { room, sessionId, userId, participantIdentity } = this.options
    if (room.state !== ConnectionState.Connected) {
      // 재연결 중에는 버퍼에 남겨 둔다. publisher 가 다음 interval 에 다시 시도한다.
      throw new VisionTransportRejection('ROOM_DISCONNECTED', 'LiveKit 룸이 연결 상태가 아닙니다.')
    }
    if (room.localParticipant.identity !== participantIdentity) {
      throw new VisionTransportRejection(
        'IDENTITY_MISMATCH',
        `participantIdentity 불일치: 기대 ${participantIdentity}, 실제 ${room.localParticipant.identity}`,
      )
    }
    if (!this.isAiWorkerPresent()) {
      // DataChannel 은 수신자가 없어도 성공으로 끝난다 — 그대로 두면 워커가 들어오기 전
      // 이벤트가 조용히 사라진다. 던져서 publisher 버퍼에 남기고 다음 interval 에 재시도한다.
      // (버퍼 수명은 transport.maxBufferedAgeMs = 30초다. 워커가 그보다 늦게 들어오면
      //  그 이전 구간은 폐기된다 — 세션 시작과 함께 워커가 입장해야 하는 이유다.)
      throw new VisionTransportRejection(
        'AI_WORKER_NOT_CONNECTED',
        `AI Worker(${this.options.aiParticipantIdentity})가 아직 룸에 없습니다.`,
      )
    }

    for (const event of [...batch.behaviorEvents, ...batch.metricSnapshots]) {
      if (event.sessionId !== sessionId) {
        throw new VisionTransportRejection(
          'SESSION_MISMATCH',
          `sessionId 불일치: 기대 ${sessionId}, 실제 ${event.sessionId}`,
        )
      }
      if (event.userId !== userId) {
        throw new VisionTransportRejection(
          'USER_MISMATCH',
          `userId 불일치: 기대 ${userId}, 실제 ${event.userId}`,
        )
      }
    }
  }

  /** remoteParticipants 는 identity 로 키가 잡히지만, 키 누락에 대비해 값도 훑는다. */
  private isAiWorkerPresent(): boolean {
    const { room, aiParticipantIdentity } = this.options
    if (room.remoteParticipants.has(aiParticipantIdentity)) return true
    for (const participant of room.remoteParticipants.values()) {
      if (participant.identity === aiParticipantIdentity) return true
    }
    return false
  }

  /**
   * publishData 는 SharedArrayBuffer 를 등에 업지 않은 뷰만 받는다.
   * TextEncoder 결과는 `Uint8Array<ArrayBufferLike>` 라 한 번 옮겨 담는다(패킷당 ≤12KB).
   */
  private encode(batch: VisionEventBatch): Uint8Array<ArrayBuffer> {
    const encoded = this.encoder.encode(JSON.stringify(batch))
    const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength))
    bytes.set(encoded)
    return bytes
  }

  /** 크기 판단 전용 — 쪼개기 반복문에서 매번 복사본을 만들지 않는다. */
  private byteLengthOf(batch: VisionEventBatch): number {
    return this.encoder.encode(JSON.stringify(batch)).byteLength
  }

  /**
   * 패킷 상한을 넘지 않게 배치를 나눈다. **패킷 간 seq 범위는 반드시 증가한다.**
   *
   * 배치는 behavior/metric 두 배열로 나뉘어 있어 전역 seq 순서를 잃는다. 그 상태로
   * 배열별로 쪼개면 `packet1 = [11,13]`, `packet2 = [10,12]` 처럼 뒤집힌 패킷이 나오고,
   * 수신 측이 패킷 단위로 순서를 신뢰하면 오래된 이벤트를 stale 로 버리게 된다.
   * 그래서 전체를 seq 로 정렬한 뒤 **연속 구간**으로만 자른다 —
   * 결과는 항상 `packet[i].maxSeq < packet[i+1].minSeq` 를 만족한다.
   *
   * 이벤트 하나가 혼자서 상한을 넘으면 쪼갤 방법이 없으므로 단독 패킷으로 보낸다
   * (SFU 가 거절하면 publisher 버퍼에 남았다가 age 초과로 폐기된다).
   */
  private split(batch: VisionEventBatch): VisionEventBatch[] {
    if (this.byteLengthOf(batch) <= this.maxPacketBytes) return [batch]

    const ordered: readonly (VisionBehaviorEvent | VisionMetricSnapshot)[] = [
      ...batch.behaviorEvents,
      ...batch.metricSnapshots,
    ].sort((left, right) => left.seq - right.seq)

    const packets: VisionEventBatch[] = []
    let current: (VisionBehaviorEvent | VisionMetricSnapshot)[] = []

    for (const event of ordered) {
      const next = [...current, event]
      if (current.length > 0 && this.byteLengthOf(toBatch(next)) > this.maxPacketBytes) {
        packets.push(toBatch(current))
        current = [event]
        continue
      }
      current = next
    }
    if (current.length > 0) packets.push(toBatch(current))
    return packets
  }
}

/** seq 로 정렬된 이벤트 묶음을 다시 계약 모양(behavior/metric 분리)으로 되돌린다. */
function toBatch(
  events: readonly (VisionBehaviorEvent | VisionMetricSnapshot)[],
): VisionEventBatch {
  return {
    behaviorEvents: events.filter(
      (event): event is VisionBehaviorEvent => event.kind === 'behavior',
    ),
    metricSnapshots: events.filter(
      (event): event is VisionMetricSnapshot => event.kind === 'metric',
    ),
  }
}
