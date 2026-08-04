import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, ConsentRow, Stack, Steps, Switch } from '@/components'
import { ONBOARDING_STEP, ONBOARDING_STEP_COUNT, ONBOARDING_STEP_LABELS } from './onboardingSteps'

/* -------------------------------------------------------------------------- */
/*  W-03 · 목적별 개인정보 동의 (AUTH-03) — 온보딩 3/5                           */
/*  - 전체 동의로 묶지 않고 목적별로 분리(디자인 원칙 §7.2)                       */
/*  - 필수 1(약관·개인정보) + 선택 4(얼굴/표정/음성/리포트)                       */
/*  - 선택을 모두 거부해도 기본 화상 연습은 동작 · 해당 AI 기능만 비활성          */
/*                                                                            */
/*  확정 옵션(사용자 지시):                                                     */
/*   ① 선택 항목 기본값 = opt-in(모두 off)                                       */
/*   ② 필수 항목 = 잠금형(항상 on·비활성) — 서비스 이용의 전제 조건              */
/*   ③ 레이아웃 = 통합 리스트(1카드)                                            */
/*   ④ 전체 동의 단축 = 제공 (선택 항목 일괄 on/off · §7.2 예외로 편의 제공)      */
/* -------------------------------------------------------------------------- */


type OptionalKey = 'face' | 'expression' | 'voice' | 'report'

interface ConsentItem {
  key: OptionalKey
  title: string
  desc: string
}

/** 선택(optional) 항목. 필수(약관)는 잠금이라 별도로 다룬다. */
const OPTIONAL_ITEMS: ConsentItem[] = [
  {
    key: 'face',
    title: '얼굴 촬영 및 얼굴상 분석',
    desc: '분석 완료 후 원본 이미지는 즉시 삭제해요. 거부 시 얼굴상 태그가 생략됩니다.',
  },
  {
    key: 'expression',
    title: '세션 중 표정 · 시선 분석',
    desc: '원본 영상은 저장하지 않고 지표만 저장해요. 거부 시 표정 코칭이 제공되지 않아요.',
  },
  {
    key: 'voice',
    title: '세션 중 음성 · 대화 분석',
    desc: '원본 음성 저장 여부는 별도로 고지해요. 거부 시 대화 코칭이 제공되지 않아요.',
  },
  {
    key: 'report',
    title: '누적 성장 리포트 저장',
    desc: '점수 · 키워드 · 통계값만 저장해요. 거부 시 리포트 축소판으로 제공됩니다.',
  },
]

/** 선택 항목 초기값 = opt-in(모두 거부). 사용자가 직접 켜야 동의로 기록된다. */
const INITIAL_OPTIONAL: Record<OptionalKey, boolean> = {
  face: false,
  expression: false,
  voice: false,
  report: false,
}

export function ConsentPage() {
  const navigate = useNavigate()
  const [optional, setOptional] = useState<Record<OptionalKey, boolean>>(INITIAL_OPTIONAL)

  const setOne = (key: OptionalKey, next: boolean) =>
    setOptional((prev) => ({ ...prev, [key]: next }))

  const allOptionalOn = OPTIONAL_ITEMS.every((it) => optional[it.key])
  const setAll = (next: boolean) =>
    setOptional({ face: next, expression: next, voice: next, report: next })

  const onContinue = () => {
    // 필수(terms)는 잠금으로 항상 동의됨. 선택 항목만 사용자 선택값으로 전송.
    // TODO(AUTH): POST /api/me/consents 로 목적별 동의 결과 전송
    console.log('consents', { terms: true, ...optional })
    navigate('/signup/profile')
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-5 px-5 py-10">
      <header>
        <Steps
          count={ONBOARDING_STEP_COUNT}
          current={ONBOARDING_STEP.consent}
          labels={ONBOARDING_STEP_LABELS}
        />
        <h1 className="bt-h2 mt-4">목적별 개인정보 동의</h1>
        <p className="bt-body-sm bt-muted mt-1">필요한 목적에만 동의할 수 있어요.</p>
      </header>

      <Callout tone="info">
        동의는 <b>목적별로 나눠</b> 받아요 — 항목마다 따로 켜고 끌 수 있어요. <b>선택 항목을 모두 거부해도
        기본 화상 연습은 이용</b>할 수 있고, 해당 AI 분석 기능만 비활성화됩니다.
      </Callout>

      {/* 전체 동의 — 선택 항목 일괄 on/off (필수는 잠금이라 항상 포함) */}
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--bt-color-border-strong)] bg-surface-sunken px-4 py-3">
        <span>
          <span className="bt-body-sm block font-semibold text-ink">전체 동의</span>
          <span className="bt-caption">선택 항목까지 한 번에 동의해요. (필수는 기본 포함)</span>
        </span>
        <Switch
          checked={allOptionalOn}
          aria-label="전체 동의"
          onChange={(e) => setAll(e.currentTarget.checked)}
        />
      </label>

      <Card>
        <Stack gap={4} role="group" aria-label="목적별 동의 항목">
          {/* 필수 — 잠금형: 항상 on·비활성 (서비스 이용 전제) */}
          <ConsentRow
            required
            checked
            disabled
            onCheckedChange={() => {}}
            title="이용약관 및 개인정보 처리"
            desc="계정 운영 · 연령 확인 · 신고 대응에 사용돼요. (서비스 이용을 위한 필수 항목)"
          />

          {OPTIONAL_ITEMS.map((item, i) => (
            <div key={item.key}>
              {i === 0 && <div className="h-px bg-[var(--bt-color-border)]" />}
              <ConsentRow
                title={item.title}
                desc={item.desc}
                checked={optional[item.key]}
                onCheckedChange={(next) => setOne(item.key, next)}
              />
            </div>
          ))}
        </Stack>
      </Card>

      <Callout tone="info" icon={null}>
        마이페이지에서 언제든 <b>철회</b>할 수 있고, 기존 분석 데이터 삭제도 요청할 수 있어요.
      </Callout>

      <Button variant="primary" size="lg" block trailingAffordance onClick={onContinue}>
        동의하고 계속
      </Button>
    </main>
  )
}
