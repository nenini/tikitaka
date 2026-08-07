import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Callout, Card, ExitToHomeButton, Icon, Stack } from '@/components'
import { useAuthStore } from '@/stores/auth.store'
import { useSoloVisionAnalysis } from '@/features/session/vision'
import type { VisionBehaviorEvent } from '@vision/vision/events/VisionEvent.js'
import { useLocalCamera } from './useLocalCamera'
import { VideoPreview } from './AiVideoSetupPage'
import {
  AI_VIDEO_SCENARIOS,
  PRACTICE_DURATION_SEC,
  QUESTION_INTERVAL_SEC,
  SCENARIO_META,
  formatDurationKo,
} from './types'
import type { AiVideoScenario, PracticeSummary } from './types'

/** 실시간 힌트가 화면에 머무는 시간. 코칭 카드(0.6배 TTL)와 같은 감각으로 짧게 둔다. */
const HINT_TTL_MS = 4_000

function parseScenario(value: string | null): AiVideoScenario {
  return AI_VIDEO_SCENARIOS.includes(value as AiVideoScenario)
    ? (value as AiVideoScenario)
    : 'first_meet'
}

/**
 * AI 화상 **혼자 연습** 화면.
 *
 * 상대가 없으므로 화면이 상대 역할을 한다 — 질문을 순서대로 던지고, 표정만
 * 로컬에서 읽어 즉시 되돌려준다. 네트워크로 나가는 것은 **아무것도 없다**.
 *
 * ⚠️ 통화 화면(`SessionPage`)과 달리 다크 고정을 쓰지 않는다. 상대 얼굴이 주인공이
 *    아니라 **질문과 내 표정**이 주인공이라, 본문 화면과 같은 톤이 읽기 쉽다.
 */
export function AiVideoPracticePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const scenario = parseScenario(params.get('topic'))
  const meta = SCENARIO_META[scenario]
  const userId = useAuthStore((s) => s.user?.id ?? null)

  const camera = useLocalCamera()
  const [elapsedSec, setElapsedSec] = useState(0)
  const [finished, setFinished] = useState(false)
  const [hint, setHint] = useState<{ text: string; at: number } | null>(null)

  /* 집계는 렌더를 유발하지 않아야 한다 — 프레임마다 setState 하면 화면이 계속 다시 그려진다.
     요약을 만들 때 한 번만 읽는다. */
  const tally = useRef({
    smileCount: 0,
    smileMs: 0,
    nodCount: 0,
    gazeAwayCount: 0,
    faceMissingCount: 0,
  })
  const smileStartedAt = useRef<number | null>(null)

  // 진입 즉시 카메라를 연다. `start` 는 useCallback 으로 고정돼 있어 한 번만 돈다.
  const startCamera = camera.start
  useEffect(() => {
    startCamera()
  }, [startCamera])

  /* ── 타이머 ── */
  useEffect(() => {
    if (finished) return
    const timer = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 1
        if (next >= PRACTICE_DURATION_SEC) setFinished(true)
        return next
      })
    }, 1_000)
    return () => clearInterval(timer)
  }, [finished])

  /* ── 표정 분석(로컬) ── */
  const onBehavior = useCallback((events: readonly VisionBehaviorEvent[]) => {
    for (const event of events) {
      switch (event.eventType) {
        case 'SMILE_STARTED':
          tally.current.smileCount += 1
          smileStartedAt.current = Date.now()
          break
        case 'SMILE_ENDED':
          if (smileStartedAt.current !== null) {
            tally.current.smileMs += Date.now() - smileStartedAt.current
            smileStartedAt.current = null
          }
          break
        case 'NOD_EVENT':
          tally.current.nodCount += 1
          break
        case 'PROLONGED_GAZE_AWAY':
          tally.current.gazeAwayCount += 1
          setHint({ text: '시선이 오래 벗어났어요. 카메라를 한 번 봐 주세요.', at: Date.now() })
          break
        case 'FACE_MISSING_STARTED':
          tally.current.faceMissingCount += 1
          setHint({ text: '얼굴이 화면에서 벗어났어요.', at: Date.now() })
          break
        case 'LOW_LIGHT_STARTED':
          setHint({ text: '화면이 어두워요. 조명을 밝히면 표정이 잘 읽혀요.', at: Date.now() })
          break
        case 'FACE_TOO_SMALL_STARTED':
          setHint({ text: '조금 더 가까이 앉아 주세요.', at: Date.now() })
          break
        default:
          break
      }
    }
  }, [])

  const vision = useSoloVisionAnalysis({
    // 끝난 뒤에는 파이프라인을 내려 카메라와 CPU 를 놓아준다.
    enabled: !finished,
    stream: camera.stream,
    userId,
    onBehavior,
  })

  /* 힌트 만료 — 이벤트가 더 안 와도 문구가 화면에 눌어붙지 않게 한다 */
  useEffect(() => {
    if (!hint) return
    const timer = setTimeout(() => setHint(null), HINT_TTL_MS)
    return () => clearTimeout(timer)
  }, [hint])

  const questionIndex = Math.min(
    Math.floor(elapsedSec / QUESTION_INTERVAL_SEC),
    meta.questions.length - 1,
  )
  const remainingSec = Math.max(0, PRACTICE_DURATION_SEC - elapsedSec)

  const summary: PracticeSummary = useMemo(
    () => ({
      practicedSec: elapsedSec,
      questionsCovered: Math.min(
        Math.floor(elapsedSec / QUESTION_INTERVAL_SEC) + 1,
        meta.questions.length,
      ),
      smileCount: tally.current.smileCount,
      // 끝나는 순간 웃고 있었으면 그 구간도 센다 — 안 그러면 마지막 미소가 통째로 빠진다.
      smileMs:
        tally.current.smileMs +
        (smileStartedAt.current !== null ? Date.now() - smileStartedAt.current : 0),
      nodCount: tally.current.nodCount,
      gazeAwayCount: tally.current.gazeAwayCount,
      faceMissingCount: tally.current.faceMissingCount,
      analysisUnavailable: vision.state === 'UNAVAILABLE' || camera.stream === null,
    }),
    [elapsedSec, meta.questions.length, vision.state, camera.stream],
  )

  if (finished) {
    return (
      <PracticeSummaryView
        scenario={scenario}
        summary={summary}
        onRestart={() => navigate('/ai-video/setup')}
        onHome={() => navigate('/')}
      />
    )
  }

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 pb-10 pt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-[20px]">
            {meta.emoji}
          </span>
          <b className="bt-h3">{meta.label}</b>
          <Badge tone="neutral">기록 안 함</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={remainingSec <= 30 ? 'warning' : 'info'}>
            <span className="bt-numeric">{formatDurationKo(remainingSec)}</span> 남음
          </Badge>
          <Button variant="secondary" size="sm" onClick={() => setFinished(true)}>
            연습 끝내기
          </Button>
          <ExitToHomeButton />
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 질문 — 이 화면의 주인공 */}
        <Card className="flex flex-1 flex-col gap-4 py-8">
          <span className="bt-caption bt-muted">
            질문 {questionIndex + 1} / {meta.questions.length}
          </span>
          <p className="bt-h2" style={{ lineHeight: 1.45 }}>
            {meta.questions[questionIndex]}
          </p>
          <p className="bt-body-sm bt-muted">
            소리 내어 답해 보세요. 다음 질문은 자동으로 넘어가요.
          </p>

          {hint && (
            <Callout tone="warning" role="status">
              {hint.text}
            </Callout>
          )}
        </Card>

        {/* 우: 내 영상 */}
        <aside className="flex w-full flex-col gap-3 lg:w-[320px]">
          <div
            className="relative aspect-[3/4] w-full overflow-hidden rounded-[var(--bt-radius-lg)]"
            style={{ background: 'var(--bt-mist-900)' }}
          >
            {camera.stream ? (
              <VideoPreview stream={camera.stream} />
            ) : (
              <div className="grid h-full place-items-center">
                <Icon name="camera-off" size={24} style={{ color: 'var(--bt-mist-400)' }} />
              </div>
            )}
          </div>
          <VisionStateLine state={vision.state} hasCamera={camera.stream !== null} />
        </aside>
      </div>
    </main>
  )
}

/** 분석이 도는지 한 줄로 알린다. 실패해도 연습은 계속되므로 danger 를 쓰지 않는다. */
function VisionStateLine({ state, hasCamera }: { state: string; hasCamera: boolean }) {
  if (!hasCamera) {
    return <p className="bt-caption bt-muted">카메라가 꺼져 있어 표정 분석은 쉬는 중이에요.</p>
  }
  if (state === 'RUNNING') {
    return <p className="bt-caption bt-muted">표정을 읽는 중이에요. 영상은 이 브라우저를 떠나지 않아요.</p>
  }
  if (state === 'STARTING') {
    return <p className="bt-caption bt-muted">표정 분석을 준비하는 중이에요…</p>
  }
  if (state === 'UNAVAILABLE') {
    return <p className="bt-caption bt-muted">이 기기에서는 표정 분석을 쓸 수 없어요. 연습은 그대로 이어집니다.</p>
  }
  return null
}

/**
 * 연습 요약.
 *
 * ⚠️ **점수·등급을 만들지 않는다.** 사실과 횟수만 남긴다(리포트 화법 규칙 §7.4).
 *    서버 분석 없이 매긴 점수는 근거가 더 약하다.
 */
function PracticeSummaryView({
  scenario,
  summary,
  onRestart,
  onHome,
}: {
  scenario: AiVideoScenario
  summary: PracticeSummary
  onRestart: () => void
  onHome: () => void
}) {
  const meta = SCENARIO_META[scenario]
  return (
    <main className="mx-auto w-full max-w-[560px] px-5 pb-10 pt-10">
      <Card className="flex flex-col gap-4">
        <div className="text-center">
          <span aria-hidden="true" className="text-[32px]">
            {meta.emoji}
          </span>
          <h1 className="bt-h2 mt-2">{meta.label} 연습을 마쳤어요</h1>
          <p className="bt-body-sm bt-muted mt-1">
            {formatDurationKo(summary.practicedSec)} 동안 질문 {summary.questionsCovered}개를
            다뤘어요.
          </p>
        </div>

        {summary.analysisUnavailable ? (
          <Callout tone="info">
            카메라나 표정 분석이 꺼져 있어 표정 기록은 남지 않았어요. 다음엔 카메라를 켜면 웃는
            빈도와 시선을 함께 볼 수 있어요.
          </Callout>
        ) : (
          <Stack gap={8}>
            <SummaryRow label="웃은 횟수" value={`${summary.smileCount}번`} />
            <SummaryRow
              label="웃은 시간"
              value={formatDurationKo(Math.round(summary.smileMs / 1000))}
            />
            <SummaryRow label="끄덕임" value={`${summary.nodCount}번`} />
            <SummaryRow label="시선이 오래 벗어남" value={`${summary.gazeAwayCount}번`} />
            {summary.faceMissingCount > 0 && (
              <SummaryRow label="얼굴이 안 잡힌 구간" value={`${summary.faceMissingCount}번`} />
            )}
          </Stack>
        )}

        {/* 기대를 정확히 맞춘다 — 리포트를 찾아 헤매지 않게 한다 */}
        <Callout tone="info">
          이 연습은 저장되지 않아요. 리포트와 사랑의 온도는 실사용자 화상 세션에서만 만들어져요.
        </Callout>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            className="w-full sm:w-auto sm:flex-1"
            onClick={onRestart}
          >
            다른 주제로 한 번 더
          </Button>
          <Button variant="primary" className="w-full sm:w-auto sm:flex-1" onClick={onHome}>
            홈으로
          </Button>
        </div>
      </Card>
    </main>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="bt-body-sm bt-muted">{label}</span>
      <span className="bt-body-sm bt-numeric font-medium">{value}</span>
    </div>
  )
}
