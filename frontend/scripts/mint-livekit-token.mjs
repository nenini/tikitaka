// 로컬 테스트용
import { AccessToken } from 'livekit-server-sdk'

const identity = process.argv[2] // 'peerA' 또는 'peerB'
const at = new AccessToken('devkey', 'secret', { identity, ttl: '24h' })
at.addGrant({ roomJoin: true, room: 'demo-room', canPublish: true, canSubscribe: true })

console.log(await at.toJwt())