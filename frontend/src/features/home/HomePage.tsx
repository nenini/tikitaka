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
      <div className="grid gap-4 sm:grid-cols-2">
        <CardLink as={Link} to="/matching">
          <CardHeader title="매칭 트랙 선택" action={<Badge tone="info">F2</Badge>} />
          <p className="bt-body-sm bt-muted">
            실사용자, AI 채팅, AI 화상채팅 중 선택
          </p>
        </CardLink>

        <CardLink as={Link} to="/chatbot">
          <CardHeader title="챗봇" />
          <p className="bt-body-sm bt-muted">
            ai 페르소나와 소개팅 전/후 상황을 연습해볼 수 있습니다.
          </p>
        </CardLink>

        <CardLink as={Link} to="/growth">
          <CardHeader title="성장 대시보드" />
          <p className="bt-body-sm bt-muted">
            사랑의 온도 추이, 강약점, 뱃지
          </p>
        </CardLink>
      </div>

      {/* 대기방(W-11)·상호평가(W-14)·세션 리포트(W-16)는 실제 sessionId 가 있어야 열린다.
          매칭이 확정되면 그 흐름 안에서 자동으로 이어지므로 홈에 바로가기를 두지 않는다. */}
    </main>
  )
}
