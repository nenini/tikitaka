import { ConnectionState, ConnectionQuality } from "livekit-client"
import type { ConnectionState as BtConnectionState } from "@/components"

// livekit 연결상태/품질 => 디자인시스템 5단계

export function toBtState(state: ConnectionState, quality: ConnectionQuality): BtConnectionState {
    switch (state) {
        case ConnectionState.Connecting:
            return 'connecting'

        case ConnectionState.Reconnecting:
        case ConnectionState.SignalReconnecting:
            return 'reconnecting'

        case ConnectionState.Connected:
            return quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost
                ? 'unstable'
                : 'connected'
        default:
            return 'disconnected'
    }
}