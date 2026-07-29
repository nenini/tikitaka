import type { Signaling, SignalMessage } from "./types";

// 로컬 테스트: 같브라우저 다른탭
export function createBroadcastSignaling(room: string): Signaling {
    const channel = new BroadcastChannel(`rtc:${room}`)
    return {
        send(message) {
            channel.postMessage(message)
        },
        onMessage(handler) {
            const listener = (e: MessageEvent<SignalMessage>) =>
                handler(e.data)
            channel.addEventListener('message', listener)
            return () => channel.removeEventListener('message', listener)
        },
        close() { channel.close() }
    }
}
