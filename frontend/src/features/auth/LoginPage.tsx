import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Field, Input, Stack } from '@/components'
import { useAuthStore } from '@/stores/auth.store'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
})
type LoginForm = z.infer<typeof loginSchema>

/** 로그인 (AUTH-01). React Hook Form + Zod + BloomTalk 디자인 시스템. 실제 API 연동은 AUTH 담당이 채운다. */
export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    // TODO(AUTH): apiClient.post('/auth/login', data) 로 교체
    console.log('login payload', data)
    setSession({ id: 'demo', nickname: '데모유저', isAdult: true }, 'demo-access-token')
    navigate('/')
  }

  return (
    // 레이아웃은 Tailwind, 컴포넌트는 공용 래퍼 — 두 시스템의 하이브리드
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <Card>
        <h1 className="bt-h2">로그인</h1>
        <p className="bt-body-sm bt-muted mt-1">연습은 여기서 시작돼요.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
          <Stack>
            {/* Field 가 id·aria-describedby·aria-invalid 를 Input 에 자동 연결한다 */}
            <Field label="이메일" required error={errors.email?.message}>
              <Input type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
            </Field>

            <Field label="비밀번호" required error={errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="8자 이상"
                {...register('password')}
              />
            </Field>

            <Button type="submit" variant="primary" block loading={isSubmitting}>
              로그인
            </Button>
          </Stack>
        </form>
      </Card>
    </main>
  )
}
