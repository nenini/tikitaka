import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, ExitToHomeButton, Field, Segmented, Select, Spinner } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { createChatSession, getPersonaOptions, requestPersonaRecommendation, saveRegionCity } from './api'
import { REGION_CITIES, STAGE_DESC, STAGE_LABEL } from './types'
import type { ConversationStage } from './types'

const STAGE_OPTIONS = (Object.keys(STAGE_LABEL) as ConversationStage[]).map((value) => ({
  value,
  label: STAGE_LABEL[value],
}))

/**
 * W-10 챗봇 페르소나 설정 (AI-DATE-01/02 · FE-B).
 *
 * 수집 항목
 *  - 지역(시·도만) · 최초 1회, 이미 있으면 건너뛴다
 *  - 연습 단계: 소개팅 전 / 소개팅 후
 *
 * ⚠️ 성향(적극적·중간·내향적) 선택은 제거했다. 세션 생성 요청이 `purpose` 하나만
 *    받고 그 값도 고정이라 성향은 서버에 전달된 적이 없다 — AI 응답에 아무 영향을
 *    주지 못하는 선택지였다. 사용자가 고르는 항목은 연습 단계뿐이다.
 */
export function PersonaSetupPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [needsRegion, setNeedsRegion] = useState(false)
  const [regionCity, setRegionCity] = useState('')
  const [stage, setStage] = useState<ConversationStage>('BEFORE_DATE')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([getPersonaOptions(), requestPersonaRecommendation()]).then(([options, rec]) => {
      if (!alive) return
      setNeedsRegion(!options.regionCity)
      setStage(rec.stage)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const regionValid = !needsRegion || regionCity !== ''

  async function handleStart() {
    if (starting || !regionValid) return
    setStarting(true)
    setError(null)
    try {
      if (needsRegion) await saveRegionCity(regionCity)
      // ⚠️ 서버는 `purpose` 만 받는다 — 연습 단계는 브라우저에 보관된다(api.ts 참고).
      const session = await createChatSession({ stage })
      navigate(`/chatbot/${session.chatSessionId}`, { replace: true })
    } catch (startError) {
      setError(errorMessageOf(startError, '대화를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-[720px] justify-center px-5 py-24">
        <Spinner label="상대 설정을 불러오는 중" />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bt-h1">챗봇 상대를 설정할까요?</h1>
          <p className="bt-body bt-muted mt-1">
            AI 채팅은 텍스트로 진행됩니다. 소개팅 전후 대화 감각을 익혀요.
          </p>
        </div>
        <ExitToHomeButton />
      </header>

      <div className="flex flex-col gap-4">
        {needsRegion && (
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <b className="bt-h3">지역 입력</b>
              <Badge tone="info">최초 1회</Badge>
            </div>
            <Field label="시 · 도" required>
              <Select
                placeholder="선택해 주세요"
                options={REGION_CITIES.map((city) => ({ value: city, label: city }))}
                value={regionCity}
                onChange={(e) => setRegionCity(e.currentTarget.value)}
              />
            </Field>
            <p className="bt-caption bt-muted">
              챗봇을 처음 쓸 때만 받아요. 대화 중 약속 장소 선정에 활용돼요.
            </p>
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <b className="bt-h3">연습 단계</b>
          <Segmented aria-label="연습 단계" options={STAGE_OPTIONS} value={stage} onChange={setStage} />
          <p className="bt-caption bt-muted">{STAGE_DESC[stage]}</p>
        </Card>

        {/* <Callout tone="info">
          12시간 동안 답장이 없으면 챗봇이 <b>1회만</b> 먼저 말을 걸어요(야간 00–09시는 아침까지 보류).
        </Callout> */}

        {error && <Callout tone="danger">{error}</Callout>}

        <Button size="lg" block loading={starting} disabled={!regionValid} onClick={handleStart}>
          대화 시작
        </Button>
      </div>
    </main>
  )
}
