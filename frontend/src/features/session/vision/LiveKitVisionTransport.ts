import { ConnectionState, type Room } from 'livekit-client'
import type {
  VisionEventBatch,
  VisionEventTransport,
} from '@vision/vision/events/VisionEventPublisher.js'

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

/** 백엔드 `LiveKitAiWorkerTokenIssuer.IDENTITY_PREFIX` 와 같은 규칙. */
export function aiWorkerIdentityOf(sessionId: string): string {
  return `ai-session-${sessionId}`
}

/** 백엔드 `RoomParticipant.identityOf` 와 같은 규칙. */
export function participantIdentityOf(userId: string): string {
  return `user-${userId}`
}

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
   * 패킷 상한을 넘지 않게 배치를 나눈다.
   *
   * seq 순서는 수신 측이 `ordered_events()` 로 복원하므로, 여기서는 크기만 본다.
   * 이벤트 하나가 혼자서 상한을 넘으면 쪼갤 방법이 없으므로 단독 패킷으로 보낸다
   * (SFU 가 거절하면 publisher 버퍼에 남았다가 age 초과로 폐기된다).
   */
  private split(batch: VisionEventBatch): VisionEventBatch[] {
    if (this.byteLengthOf(batch) <= this.maxPacketBytes) return [batch]

    const packets: VisionEventBatch[] = []
    let behaviorEvents: VisionEventBatch['behaviorEvents'][number][] = []
    let metricSnapshots: VisionEventBatch['metricSnapshots'][number][] = []

    const flush = () => {
      if (behaviorEvents.length === 0 && metricSnapshots.length === 0) return
      packets.push({ behaviorEvents, metricSnapshots })
      behaviorEvents = []
      metricSnapshots = []
    }

    // 행동 이벤트를 먼저 채운다 — 용량 압박에서 살아남아야 하는 쪽이다
    // (BufferedVisionEventPublisher 도 같은 우선순위로 메트릭부터 버린다).
    for (const event of batch.behaviorEvents) {
      const next = [...behaviorEvents, event]
      if (
        behaviorEvents.length > 0 &&
        this.byteLengthOf({ behaviorEvents: next, metricSnapshots }) > this.maxPacketBytes
      ) {
        flush()
        behaviorEvents = [event]
        continue
      }
      behaviorEvents = next
    }
    for (const snapshot of batch.metricSnapshots) {
      const next = [...metricSnapshots, snapshot]
      if (
        (behaviorEvents.length > 0 || metricSnapshots.length > 0) &&
        this.byteLengthOf({ behaviorEvents, metricSnapshots: next }) > this.maxPacketBytes
      ) {
        flush()
        metricSnapshots = [snapshot]
        continue
      }
      metricSnapshots = next
    }
    flush()
    return packets
  }
}
