// 나중에 api 준비되면 STOMP로 구현체 변경예정

export type SignalMessage =
    | { kind: 'hello'; from: string }
    | { kind: 'description'; description: RTCSessionDescriptionInit }
    | { kind: 'candidate'; candidate: RTCIceCandidateInit }
    | { kind: 'bye' }

export interface Signaling {
    send(message: SignalMessage): void
    // 수신 구독/해제 함수 반환
    onMessage(handler: (message: SignalMessage) => void): () => void
    close(): void
}