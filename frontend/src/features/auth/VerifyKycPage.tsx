import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, CardButton, Icon, Stack, Steps } from '@/components'
import { cn } from '@/shared/lib/cn'

/* -------------------------------------------------------------------------- */
/*  W-02b · 본인 인증 (KYC · Mock) — 온보딩 2/4                                  */
/*  - 통신사 PASS 본인확인으로 '성인 여부'만 확인 (데모는 Mock 즉시 통과)         */
/*  - 실명·주민번호·생년월일 미저장. 결과는 연령대·CI 만 전달받는다.             */
/*  - 공통 컴포넌트 규약 준수: Steps / Card / CardButton / Callout / Button 등    */
/* -------------------------------------------------------------------------- */

const STEP_LABELS = ['계정', '본인인증', '동의', '프로필', '설문'] as const

/** 본인확인 수단. 신분증 인증은 제외(사용자 지시) — 통신사 PASS 단일. */
interface KycProvider {
  id: string
  name: string
  desc: string
  mock?: boolean
}
const PROVIDERS: KycProvider[] = [
  { id: 'pass', name: '통신사 PASS 본인확인', desc: '휴대폰 명의로 성인 여부를 확인해요', mock: true },
]

type Status = 'idle' | 'verifying' | 'verified'

/** 데모용 KYC 스텁. TODO(AUTH): POST /api/auth/kyc/start → 제공사 콜백으로 교체. */
async function runMockKyc(): Promise<{ ageBand: string }> {
  await new Promise((r) => setTimeout(r, 900))
  return { ageBand: '20대 후반' }
}

export function VerifyKycPage() {
  const navigate = useNavigate()
  const [provider, setProvider] = useState(PROVIDERS[0].id)
  const [status, setStatus] = useState<Status>('idle')
  const [ageBand, setAgeBand] = useState<string | null>(null)

  const verified = status === 'verified'

  const onVerify = async () => {
    setStatus('verifying')
    // TODO(AUTH): 실제 PASS/NICE 제공사 리다이렉트 + 콜백 처리
    const res = await runMockKyc()
    setAgeBand(res.ageBand)
    setStatus('verified')
  }

  const onNext = () => {
    // TODO(AUTH): 성인 확인 완료 상태를 서버/스토어에 반영
    navigate('/signup/consent')
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-5 px-5 py-10">
      <header>
        <Steps count={5} current={2} labels={STEP_LABELS} />
        <h1 className="bt-h2 mt-4">본인 인증</h1>
        <p className="bt-body-sm bt-muted mt-1">성인 여부만 확인해요. 오래 걸리지 않아요.</p>
      </header>

      <Card>
        <Stack gap={16}>
          <div>
            <h2 className="bt-h3">본인 확인으로 성인 여부를 인증해요</h2>
            <p className="bt-body-sm bt-muted mt-1">
              인증 결과(연령대·CI)만 전달받고{' '}
              <b className="text-ink">실명·주민번호·생년월일은 저장하지 않아요.</b>
            </p>
          </div>

          {/* 본인확인 수단 선택 (현재 통신사 PASS 단일) */}
          <div role="radiogroup" aria-label="본인확인 수단">
            <Stack gap={8}>
              {PROVIDERS.map((p) => {
                const selected = provider === p.id
                return (
                  <CardButton
                    key={p.id}
                    role="radio"
                    aria-checked={selected}
                    disabled={status !== 'idle'}
                    onClick={() => setProvider(p.id)}
                    className={cn('flex items-center gap-3 text-left')}
                    style={
                      selected ? { boxShadow: '0 0 0 2px var(--bt-color-action)' } : undefined
                    }
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-5 shrink-0 place-items-center rounded-full border-2"
                      style={{
                        borderColor: selected
                          ? 'var(--bt-color-action)'
                          : 'var(--bt-color-border-strong)',
                      }}
                    >
                      {selected && (
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: 'var(--bt-color-action)' }}
                        />
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="flex items-center gap-2">
                        <b>{p.name}</b>
                        {p.mock && <Badge tone="info">MOCK</Badge>}
                      </span>
                      <span className="bt-caption mt-0.5 block">{p.desc}</span>
                    </span>
                    {verified && selected && (
                      <Icon name="check-circle" size={20} className="text-success" />
                    )}
                  </CardButton>
                )
              })}
            </Stack>
          </div>

          {/* 인증 결과 */}
          {verified && (
            <Callout tone="success" icon="check-circle">
              <b>인증 완료 · 성인 확인됨.</b> 프로필에는 <b>{ageBand}</b> 연령대만 표시돼요.
            </Callout>
          )}
        </Stack>
      </Card>

      <Callout tone="info">
        데모에서는 인증이 <b>Mock으로 즉시 통과</b>돼요. 실제 서비스는 PASS·NICE 등 KYC 제공사로 연동됩니다.
      </Callout>

      {/* 하단 액션 — 좁은 화면에선 세로 스택(primary 위), sm 이상에선 나란히 */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="lg"
          leadingIcon="chevron-left"
          onClick={() => navigate('/signup')}
        >
          이전
        </Button>
        {verified ? (
          <Button variant="primary" size="lg" className="flex-1" trailingAffordance onClick={onNext}>
            다음 · 프로필
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            loading={status === 'verifying'}
            loadingLabel="본인확인 진행 중"
            onClick={onVerify}
          >
            통신사 PASS로 본인확인
          </Button>
        )}
      </div>

      {/* 접근성: 인증 진행/완료를 스크린리더에 알린다 */}
      <span className="bt-sr-only" role="status" aria-live="polite">
        {status === 'verifying'
          ? '본인확인 진행 중'
          : status === 'verified'
            ? '본인확인이 완료되었습니다. 성인으로 확인되었습니다.'
            : ''}
      </span>
    </main>
  )
}
