import type { ReactNode } from 'react'
import { Steps } from '@/components'
import { ONBOARDING_STEP_COUNT, ONBOARDING_STEP_LABELS } from './onboardingSteps'

interface OnboardingShellProps {
  current?: number
  eyebrow?: string
  title: string
  description: string
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg'
  visualTitle?: ReactNode
  visualDescription?: string
}

/**
 * 가입부터 설문까지 같은 장면과 리듬을 유지하는 온보딩 전용 셸.
 * 기능 화면은 Paper 위에서 읽고, 데스크톱의 왼쪽 미디어 레일만 브랜드 감정을 담당한다.
 */
export function OnboardingShell({
  current,
  eyebrow = '티키타카 시작하기',
  title,
  description,
  children,
  maxWidth = 'md',
  visualTitle = (
    <>
      대화는 조금씩,
      <br />
      편안해질 수 있어요.
    </>
  ),
  visualDescription = '필요한 만큼만 알려주세요. 나머지는 티키타카가 차분하게 안내할게요.',
}: OnboardingShellProps) {
  const stepLabel = current ? `${current} / ${ONBOARDING_STEP_COUNT}` : undefined

  return (
    <main className="tk-brand-scope tk-onboarding-shell">
      <aside className="tk-onboarding-visual" aria-label="티키타카 온보딩 안내">
        <div className="tk-onboarding-visual__scrim" aria-hidden="true" />
        <div className="tk-onboarding-visual__top">
          <BrandLockup inverse />
          {stepLabel && <span className="tk-onboarding-visual__step">STEP {stepLabel}</span>}
        </div>
        <div className="tk-onboarding-visual__copy">
          <p className="tk-onboarding-visual__eyebrow">Practice · Connect · Bloom</p>
          <p className="tk-onboarding-visual__title">{visualTitle}</p>
          <p className="tk-onboarding-visual__description">{visualDescription}</p>
        </div>
      </aside>

      <section className="tk-onboarding-panel">
        <div className={`tk-onboarding-panel__inner tk-onboarding-panel__inner--${maxWidth}`}>
          <div className="tk-onboarding-mobile-brand">
            <BrandLockup />
            {stepLabel && <span>STEP {stepLabel}</span>}
          </div>

          <header className="tk-onboarding-header">
            {current && (
              <Steps
                count={ONBOARDING_STEP_COUNT}
                current={current}
                labels={ONBOARDING_STEP_LABELS}
              />
            )}
            <p className="tk-onboarding-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>

          <div className="tk-onboarding-content">{children}</div>
        </div>
      </section>
    </main>
  )
}

export function BrandLockup({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`tk-brand-lockup${inverse ? ' tk-brand-lockup--inverse' : ''}`}>
      <img
        src={inverse ? '/tika-logo-whitever.webp' : '/tika-logo-black.png'}
        alt=""
        aria-hidden="true"
        width={82}
        height={48}
      />
      <span>티키타카</span>
    </span>
  )
}
