import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
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
    // 레이아웃은 Tailwind, 컴포넌트는 .bt-* — 두 시스템의 하이브리드
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center p-6">
      <div className="bt-card">
        <h1 className="bt-h2">로그인</h1>
        <p className="bt-body-sm bt-muted mt-1">연습은 여기서 시작돼요.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="bt-stack mt-6">
          <div className="bt-field">
            <label className="bt-label" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="bt-input"
              aria-invalid={errors.email ? 'true' : undefined}
              {...register('email')}
            />
            {errors.email && <p className="bt-error">{errors.email.message}</p>}
          </div>

          <div className="bt-field">
            <label className="bt-label" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              placeholder="8자 이상"
              className="bt-input"
              aria-invalid={errors.password ? 'true' : undefined}
              {...register('password')}
            />
            {errors.password && <p className="bt-error">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            className={`bt-btn bt-btn--primary bt-btn--block ${isSubmitting ? 'is-loading' : ''}`}
            disabled={isSubmitting}
          >
            로그인
          </button>
        </form>
      </div>
    </main>
  )
}
