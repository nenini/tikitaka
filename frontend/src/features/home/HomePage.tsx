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

        <CardLink as={Link} to="/session/demo/room">
          <CardHeader title="대기방 입장 (기기 점검)" action={<Badge tone="info">P0</Badge>} />
          <p className="bt-body-sm bt-muted">
            카메라·마이크·스피커를 점검하고 세션에 입장합니다. 통과하면 WebRTC 세션(다크 고정)으로 이어져요.
          </p>
        </CardLink>

        <CardLink as={Link} to="/session/demo/review">
          <CardHeader title="상대 평가" />
          <p className="bt-body-sm bt-muted">
            정량평가 6개 지표, 글 피드백, 신고/차단
          </p>
        </CardLink>

        <CardLink as={Link} to="/chatbot">
          <CardHeader title="챗봇" />
          <p className="bt-body-sm bt-muted">
            ai 페르소나와 소개팅 전/후 상황을 연습해볼 수 있습니다.
          </p>
        </CardLink>


        <CardLink as={Link} to="/session/demo/report">
          <CardHeader title="세션 리포트" />
          <p className="bt-body-sm bt-muted">
            ai 분석 및 상대 평가
          </p>
        </CardLink>

        <CardLink as={Link} to="/growth">
          <CardHeader title="성장 대시보드" />
          <p className="bt-body-sm bt-muted">
            사랑의 온도 추이, 강약점, 뱃지
          </p>
        </CardLink>


      </div>
    </main>
  )
}
