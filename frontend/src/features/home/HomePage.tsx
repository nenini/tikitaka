import { Link } from 'react-router-dom'
import { Badge, Button, CardHeader, CardLink } from '@/components'
import { useAuthStore } from '@/stores/auth.store'

export function HomePage() {
  const { user, signOut } = useAuthStore()

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bt-h1">화상 모의 소개팅</h1>
          <p className="bt-body bt-muted mt-1">
            {user ? `${user.nickname} 님, 반가워요.` : '로그인된 사용자'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          로그아웃
        </Button>
      </div>

      {/* div + onClick 이 아니라 실제 링크 — 키보드/스크린리더로도 도달·활성화된다 */}
      <CardLink as={Link} to="/session/demo">
        <CardHeader title="데모 세션 열기" action={<Badge tone="info">P0</Badge>} />
        <p className="bt-body-sm bt-muted">
          WebRTC 화상 세션 화면(다크 고정)으로 이동합니다. 실제 연결은 FE-A 가 구현.
        </p>
      </CardLink>
    </main>
  )
}
