import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/components'

/** 다음 차수에 만들 인증 화면들의 임시 자리(W-02 회원가입, 비밀번호 찾기 등). */
export function AuthPlaceholder({ title, note }: { title: string; note: string }) {
  const navigate = useNavigate()
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken px-5 py-10">
      <Card className="w-full max-w-[420px] text-center">
        <span aria-hidden="true" className="text-[28px]">
          🌸
        </span>
        <h1 className="bt-h2 mt-2">{title}</h1>
        <p className="bt-body-sm bt-muted mt-2">{note}</p>
        <Button
          className="mt-6"
          size="lg"
          block
          leadingIcon="chevron-left"
          onClick={() => navigate('/login')}
        >
          로그인으로 돌아가기
        </Button>
      </Card>
    </main>
  )
}

export function SignupPage() {
  return (
    <AuthPlaceholder title="회원가입 (W-02)" note="다음 단계에서 구현할 계정 만들기 화면입니다." />
  )
}

export function ForgotPasswordPage() {
  return <AuthPlaceholder title="비밀번호 찾기" note="다음 단계에서 구현할 화면입니다." />
}
