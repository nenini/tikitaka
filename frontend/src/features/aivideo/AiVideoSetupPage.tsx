import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, ExitToHomeButton, Icon, Spinner } from '@/components'
import { useLocalCamera } from './useLocalCamera'
import { AI_VIDEO_SCENARIOS, PRACTICE_DURATION_SEC, SCENARIO_META, formatDurationKo } from './types'
import type { AiVideoScenario } from './types'

/**
 * W-21 AI 화상 연습 설정.
 *
 * 주제를 고르고 카메라를 점검한 뒤 연습으로 넘어간다. 카메라가 열리지 않아도
 * **연습 자체는 시작할 수 있다** — 질문 카드를 보며 소리 내어 답하는 것만으로도
 * 연습이 되고, 카메라는 표정 분석에만 쓰인다.
 */
export function AiVideoSetupPage() {
  const navigate = useNavigate()
  const camera = useLocalCamera()
  const [scenario, setScenario] = useState<AiVideoScenario>('first_meet')

  // 들어오자마자 권한을 물어본다 — 주제를 고르는 동안 점검이 끝나 있게 한다.
  // `start` 는 useCallback 으로 고정돼 있어 한 번만 돈다.
  const startCamera = camera.start
  useEffect(() => {
    startCamera()
  }, [startCamera])

  return (
    <main className="mx-auto w-full max-w-[880px] px-5 pb-10 pt-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bt-h1">AI 화상 연습</h1>
          <p className="bt-body bt-muted mt-1">
            상대 없이 {formatDurationKo(PRACTICE_DURATION_SEC)} 동안 말하는 연습을 해요. 질문이
            순서대로 나와요.
          </p>
        </div>
        <ExitToHomeButton />
      </header>

      {/* 무엇이 되고 무엇이 안 되는지 먼저 말한다 — 리포트를 기대하고 들어오면 실망한다 */}
      <Callout tone="info" className="mb-4">
        이 연습은 <b>기록되지 않아요.</b> 영상과 표정 분석 모두 브라우저 안에서만 처리되고 서버로
        보내지 않아요. 그래서 리포트와 사랑의 온도에도 반영되지 않습니다.
      </Callout>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌: 주제 */}
        <Card className="flex flex-1 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <b className="bt-h3">주제 고르기</b>
            <span className="bt-caption bt-muted">질문 5개</span>
          </div>
          <div className="flex flex-col gap-2">
            {AI_VIDEO_SCENARIOS.map((code) => (
              <ScenarioRow
                key={code}
                code={code}
                selected={scenario === code}
                onSelect={() => setScenario(code)}
              />
            ))}
          </div>
        </Card>

        {/* 우: 카메라 점검 */}
        <aside className="flex w-full flex-col gap-4 lg:w-[340px]">
          <Card className="flex flex-col gap-3">
            <b className="bt-h3">카메라 점검</b>
            <CameraPreview camera={camera} />
            <CameraNotice state={camera.state} onRetry={camera.start} />
          </Card>

          <Button size="lg" block onClick={() => navigate(`/ai-video/practice?topic=${scenario}`)}>
            연습 시작
          </Button>
          <p className="bt-caption bt-muted text-center">
            카메라 없이도 시작할 수 있어요. 표정 분석만 꺼집니다.
          </p>
        </aside>
      </div>
    </main>
  )
}

function ScenarioRow({
  code,
  selected,
  onSelect,
}: {
  code: AiVideoScenario
  selected: boolean
  onSelect: () => void
}) {
  const meta = SCENARIO_META[code]
  return (
    <button
      type="button"
      className="bt-row w-full text-left"
      aria-pressed={selected}
      onClick={onSelect}
      style={
        selected
          ? {
              outline: '2px solid var(--bt-color-action)',
              outlineOffset: '-2px',
              borderRadius: 'var(--bt-radius-lg)',
            }
          : undefined
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="text-[22px]">
          {meta.emoji}
        </span>
        <div className="min-w-0">
          <div className="bt-body-sm font-medium">{meta.label}</div>
          <div className="bt-caption bt-muted truncate">{meta.description}</div>
        </div>
      </div>
      {selected && <Icon name="check-circle" size={18} style={{ color: 'var(--bt-color-action)' }} />}
    </button>
  )
}

function CameraPreview({ camera }: { camera: ReturnType<typeof useLocalCamera> }) {
  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-[var(--bt-radius-lg)]"
      style={{ background: 'var(--bt-mist-900)' }}
    >
      {camera.stream ? (
        <VideoPreview stream={camera.stream} />
      ) : (
        <div className="grid h-full place-items-center">
          {camera.state === 'REQUESTING' ? (
            <Spinner size={24} />
          ) : (
            <Icon name="camera-off" size={24} style={{ color: 'var(--bt-mist-400)' }} />
          )}
        </div>
      )}
    </div>
  )
}

/** 미리보기는 거울처럼 좌우 반전한다 — 자세를 맞추기 쉽다(얼굴 촬영 화면과 같은 규칙). */
export function VideoPreview({ stream }: { stream: MediaStream }) {
  return (
    <video
      autoPlay
      playsInline
      muted
      ref={(element) => {
        if (element && element.srcObject !== stream) element.srcObject = stream
      }}
      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
    />
  )
}

function CameraNotice({ state, onRetry }: { state: string; onRetry: () => void }) {
  if (state === 'READY') {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="success">● 준비됨</Badge>
        <span className="bt-caption bt-muted">표정 분석이 켜집니다.</span>
      </div>
    )
  }
  if (state === 'REQUESTING') {
    return <p className="bt-caption bt-muted">카메라 권한을 확인하는 중이에요…</p>
  }
  if (state === 'DENIED') {
    return (
      <Callout tone="warning">
        카메라 권한이 거부됐어요. 주소창의 자물쇠 아이콘에서 허용으로 바꾼 뒤 다시 시도해 주세요.
        <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      </Callout>
    )
  }
  if (state === 'UNAVAILABLE') {
    return (
      <Callout tone="warning">
        카메라를 열지 못했어요. 다른 프로그램이 쓰고 있는지 확인해 주세요. 카메라 없이도 연습은
        가능합니다.
      </Callout>
    )
  }
  return null
}
