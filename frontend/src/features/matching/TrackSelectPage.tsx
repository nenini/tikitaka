import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, Icon } from '@/components'
import type { IconName } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getMySurveyOrNull } from '@/shared/api/me'
import { createMatchRequest, getCurrentMatchRequest, onboardingBlockReason } from './api'
import { QueueSetupModal } from './QueueSetupModal'
import type { MatchRequestInput } from './types'

/**
 * W-08b 매칭 트랙 선택 (MATCH-01, FE-B).
 * 트랙 3분기: 실사용자 화상(대기 큐) · AI 화상 · AI 챗봇.
 * 규칙: 동시 진행 매칭 1개 · AI화상/챗봇을 이용해도 대기 큐는 유지(‘큐 이탈’로만 해제).
 * 음성 미동의 사용자는 AI 화상 카드를 비활성 + 챗봇 유도.
 *
 * 백엔드 연동
 *  - `POST /api/v1/match-requests` 는 연령 범위 + 가능 시간대를 **필수**로 받는다 →
 *    등록 전에 `QueueSetupModal` 로 입력을 받는다(초기값은 온보딩 설문에서 가져온다).
 *  - 이미 대기 중이면(`GET /match-requests/me/current`) 큐 화면으로 바로 보낸다.
 *  - 온보딩(프로필·설문·얼굴상) 미완료는 서버가 409 로 막는다 → 사유를 그대로 안내한다.
 */
export function TrackSelectPage() {
  const navigate = useNavigate()
  const [setupOpen, setSetupOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [initialInput, setInitialInput] = useState<Partial<MatchRequestInput> | undefined>()
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  /*
   * 음성 분석 동의 게이트를 두지 않는다.
   *
   * 확정 계약(CONTRACT_DECISIONS.md A8): 표정·음성 분석은 **별도 동의 항목이 아니라
   * 가입 시 통합 필수 동의에 포함**되고, 세션 단위 on/off 는 동의가 아니라
   * `PATCH /sessions/{id}/analysis-settings` 로 다룬다. `consent_types` 에도
   * VOICE 코드가 없다(INTEGRATED_SERVICE_CONSENT · FACE_CAPTURE_CONSENT 2종뿐).
   *
   * 통합 동의는 온보딩 게이트가 이미 강제하므로(ProtectedRoute → needs-consent),
   * 이 화면에 도달한 사용자는 동의를 마친 상태다. 여기서 다시 물을 근거가 없다.
   */

  // 이미 대기 중인 요청이 있으면 트랙 선택 화면에 머무를 이유가 없다.
  useEffect(() => {
    let alive = true
    getCurrentMatchRequest()
      .then((current) => {
        if (alive && current && current.status === 'WAITING') {
          navigate(`/matching/queue/${current.matchRequestId}`, { replace: true })
        }
      })
      .catch(() => {
        /* 조회 실패는 무시 — 등록 시점에 서버가 다시 판정한다 */
      })
    return () => {
      alive = false
    }
  }, [navigate])

  /** 설문에서 연령 범위를 끌어와 모달 초기값으로 쓴다. */
  async function openSetup() {
    if (checking) return
    setChecking(true)
    setBlockReason(null)
    setSubmitError(null)
    try {
      const survey = await getMySurveyOrNull()
      setInitialInput(
        survey
          ? { preferredAgeMin: survey.minPreferredAge, preferredAgeMax: survey.maxPreferredAge }
          : undefined,
      )
      setSetupOpen(true)
    } finally {
      setChecking(false)
    }
  }

  async function submitQueue(input: MatchRequestInput) {
    try {
      const queued = await createMatchRequest(input)
      setSetupOpen(false)
      navigate(`/matching/queue/${queued.matchRequestId}`)
    } catch (error) {
      // 온보딩 미완료는 모달을 닫고 화면 상단에서 안내한다 — 모달 안에서 해결할 수 없는 문제다.
      const onboarding = onboardingBlockReason(error)
      if (onboarding) {
        setSetupOpen(false)
        setBlockReason(onboarding)
        return
      }
      throw new Error(errorMessageOf(error, '대기 큐에 등록하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1040px] px-5 py-6">
      <header className="mb-5">
        <h1 className="bt-h1">어떤 상대와 연습할까요?</h1>
        <p className="bt-body bt-muted mt-1">
          동시에 진행할 수 있는 실사용자 매칭은 1개입니다. AI 화상·챗봇은 대기 큐를 유지한 채 이용할 수
          있어요.
        </p>
      </header>

      {/* 카드 내부를 [헤더 / 핵심 3개 / 안내+CTA] 3행 그리드로 고정해 3열의 CTA 라인을 맞춘다 */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* 실사용자 — 추천 */}
        <TrackCard
          icon="user"
          badge={<Badge tone="info">추천</Badge>}
          title="실사용자 화상 세션"
          subtitle="실제 사람과 30분 대화"
          recommended
          facts={[
            { icon: 'clock', label: '30분 · 매칭까지 대기' },
            { icon: 'sparkle', label: '표정 + 대화 코칭' },
            { icon: 'heart', label: '상호 평가 · 연락처 교환 가능' },
          ]}
          note="노쇼·직전 취소 시 패널티가 있어요."
          cta={
            <Button variant="primary" block loading={checking} onClick={openSetup}>
              대기 큐 등록
            </Button>
          }
        />

        {/* AI 화상 */}
        <TrackCard
          icon="bot"
          title="AI 화상 연습"
          subtitle="음성(TTS) 상대 · 내 얼굴만 표시"
          facts={[
            { icon: 'clock', label: '10~15분 · 즉시 시작' },
            { icon: 'sparkle', label: '대화 코칭 + 표정 코칭' },
            { icon: 'close', label: '상호 평가·연락처 없음', muted: true },
          ]}
          note="표정·음성 분석은 세션 시작 전에 끌 수 있어요."
          cta={
            <Button variant="secondary" block onClick={() => navigate('/ai-video/setup')}>
              AI 화상 시작
            </Button>
          }
        />

        {/* AI 챗봇 — 큐 유지(결정: 명세 규칙) */}
        <TrackCard
          icon="chat"
          title="AI 챗봇 대화"
          subtitle="텍스트 전용 · 소개팅 전/후"
          facts={[
            { icon: 'clock', label: '24시간 · 즉시 시작' },
            { icon: 'sparkle', label: '말투 페르소나 · 문장 코칭' },
            { icon: 'close', label: '화상·온도 반영 없음', muted: true },
          ]}
          note="대기 큐를 유지한 채 이용할 수 있어요."
          cta={
            <Button variant="secondary" block onClick={() => navigate('/chatbot/persona')}>
              챗봇 시작
            </Button>
          }
        />
      </div>

      {/* 온보딩 미완료 안내 — 서버가 알려준 사유를 그대로 쓴다 */}
      {blockReason && (
        <Callout tone="warning" className="mt-4">
          {blockReason}
        </Callout>
      )}

      <QueueSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onSubmit={submitQueue}
        initial={initialInput}
        error={submitError}
      />
    </main>
  )
}

/* ── 트랙 카드 ── */

/**
 * 카드에 올릴 사실 한 줄. 트랙당 **3개로 고정**한다 —
 * 항목을 늘리면 3열 카드가 서로 다른 높이가 되고, 사용자는 어차피 다 읽지 않는다.
 */
interface TrackFact {
  icon: IconName
  label: string
  /** 이 트랙에 **없는** 기능. 색이 아니라 아이콘(×)과 밝기로 구분한다 */
  muted?: boolean
}

// note 는 현재 렌더하지 않는다(아래 주석 처리된 <p> 참고). 호출부의 문구는 그대로 두고
// 여기서 구조 분해만 하지 않아, 다시 켤 때 값을 새로 채워 넣지 않아도 되게 남겨둔다.
function TrackCard({
  icon,
  badge,
  title,
  subtitle,
  facts,
  cta,
  recommended = false,
}: {
  icon: IconName
  badge?: React.ReactNode
  title: string
  subtitle: string
  facts: readonly TrackFact[]
  note: string
  cta: React.ReactNode
  recommended?: boolean
}) {
  return (
    <Card
      // 3행 고정 그리드: 사실 목록 길이가 달라도 세 카드의 CTA 가 같은 줄에 선다
      className="grid grid-rows-[auto_1fr_auto] gap-4"
      style={
        recommended
          ? { outline: '2px solid var(--bt-color-action)', outlineOffset: '-2px' }
          : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <span
            className="grid h-11 w-11 place-items-center rounded-[var(--bt-radius-lg)]"
            style={{ background: 'var(--bt-color-action-subtle)', color: 'var(--bt-color-action)' }}
          >
            <Icon name={icon} size={24} />
          </span>
          {badge}
        </div>
        <div>
          <b className="bt-h3">{title}</b>
          <p className="bt-body-sm bt-muted mt-0.5">{subtitle}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {facts.map((f) => (
          <li key={f.label} className="bt-body-sm flex items-start gap-2">
            <Icon
              name={f.icon}
              size={16}
              className="mt-0.5 shrink-0"
              style={{ color: f.muted ? 'var(--bt-color-text-tertiary)' : 'var(--bt-color-success)' }}
            />
            <span className={f.muted ? 'bt-muted' : undefined}>{f.label}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        {/* <p className="bt-caption bt-muted">{note}</p> */}
        {cta}
      </div>
    </Card>
  )
}
