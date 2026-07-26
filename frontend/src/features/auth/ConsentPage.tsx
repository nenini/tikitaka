import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Card, ConsentRow, Stack, Steps } from '@/components'

/* -------------------------------------------------------------------------- */
/*  W-03 · 목적별 개인정보 동의 (AUTH-03) — 온보딩 3/5                           */
/*  - 전체 동의로 묶지 않고 목적별로 분리(디자인 원칙 §7.2)                       */
/*  - 필수 1(약관·개인정보) + 선택 4(얼굴/표정/음성/리포트)                       */
/*  - 선택을 모두 거부해도 기본 화상 연습은 동작 · 해당 AI 기능만 비활성          */
/*  - 처리 기준(보관·삭제)을 각 행 desc 에 그대로 노출                            */
/* -------------------------------------------------------------------------- */

const STEP_LABELS = ['계정', '본인인증', '동의', '프로필', '설문'] as const

type ConsentKey = 'terms' | 'face' | 'expression' | 'voice' | 'report'

interface ConsentItem {
  key: ConsentKey
  title: string
  desc: string
  required?: boolean
}

const ITEMS: ConsentItem[] = [
  {
    key: 'terms',
    title: '이용약관 및 개인정보 처리',
    desc: '계정 운영 · 연령 확인 · 신고 대응에 사용돼요.',
    required: true,
  },
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

/** 초기값은 opt-in(모두 거부). 사용자가 직접 켜야 동의로 기록된다. */
const INITIAL: Record<ConsentKey, boolean> = {
  terms: false,
  face: false,
  expression: false,
  voice: false,
  report: false,
}

export function ConsentPage() {
  const navigate = useNavigate()
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>(INITIAL)
  const [attempted, setAttempted] = useState(false)

  const setOne = (key: ConsentKey, next: boolean) =>
    setConsents((prev) => ({ ...prev, [key]: next }))

  const canContinue = consents.terms

  const onContinue = () => {
    if (!canContinue) {
      setAttempted(true)
      return
    }
    // TODO(AUTH): POST /api/me/consents 로 목적별 동의 결과 전송
    console.log('consents', consents)
    navigate('/signup/profile')
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-5 px-5 py-10">
      <header>
        <Steps count={5} current={3} labels={STEP_LABELS} />
        <h1 className="bt-h2 mt-4">목적별 개인정보 동의</h1>
        <p className="bt-body-sm bt-muted mt-1">필요한 목적에만 동의할 수 있어요.</p>
      </header>

      <Callout tone="info">
        전체 동의로 묶지 않고 <b>목적별로 분리</b>했어요. <b>선택 항목을 모두 거부해도 기본 화상 연습은
        이용</b>할 수 있고, 해당 AI 분석 기능만 비활성화됩니다.
      </Callout>

      <Card>
        <Stack gap={4} role="group" aria-label="목적별 동의 항목">
          {ITEMS.map((item, i) => (
            <div key={item.key}>
              {i > 0 && <div className="h-px bg-[var(--bt-color-border)]" />}
              <ConsentRow
                title={item.title}
                desc={item.desc}
                required={item.required}
                checked={consents[item.key]}
                onCheckedChange={(next) => setOne(item.key, next)}
              />
            </div>
          ))}
        </Stack>
      </Card>

      {attempted && !canContinue && (
        <Callout tone="warning">필수 항목(이용약관 및 개인정보 처리)에 동의해야 계속할 수 있어요.</Callout>
      )}

      <Callout tone="info" icon={null}>
        마이페이지에서 언제든 <b>철회</b>할 수 있고, 기존 분석 데이터 삭제도 요청할 수 있어요.
      </Callout>

      <Button
        variant="primary"
        size="lg"
        block
        trailingAffordance
        aria-disabled={!canContinue}
        onClick={onContinue}
      >
        동의하고 계속
      </Button>
    </main>
  )
}
