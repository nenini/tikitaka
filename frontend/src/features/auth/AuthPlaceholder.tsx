import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/components'

/** 다음 차수에 만들 인증 화면들의 임시 자리(비밀번호 찾기, KYC 등). */
export function AuthPlaceholder({
  title,
  note,
  backTo = '/login',
  backLabel = '로그인으로 돌아가기',
}: {
  title: string
  note: string
  backTo?: string
  backLabel?: string
}) {
  const navigate = useNavigate()
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken px-5 py-10">
      <Card className="w-full max-w-[420px] text-center">
        <span aria-hidden="true" className="text-[28px]">
          🌸
        </span>
        <h1 className="bt-h2 mt-2">{title}</h1>
        <p className="bt-body-sm bt-muted mt-2">{note}</p>
        <Button className="mt-6" size="lg" block leadingIcon="chevron-left" onClick={() => navigate(backTo)}>
          {backLabel}
        </Button>
      </Card>
    </main>
  )
}

/** 본인 인증(KYC · W-02b) — 회원가입 다음 단계. 다음 차수 구현. */
export function VerifyKycPage() {
  return (
    <AuthPlaceholder
      title="본인 인증 (KYC · W-02b)"
      note="회원가입 다음 단계입니다. 통신사 PASS 인증(Mock)으로 성인 여부만 확인해요 — 다음 차수에서 구현합니다."
      backTo="/signup"
      backLabel="계정 만들기로 돌아가기"
    />
  )
}

export function ForgotPasswordPage() {
  return <AuthPlaceholder title="비밀번호 찾기" note="다음 단계에서 구현할 화면입니다." />
}
