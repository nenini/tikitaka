import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, Cluster, Icon, Spinner } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { useAuthStore } from '@/stores/auth.store'
import {
  DEMO_STEP_TEXT,
  acceptMatch,
  enqueueForDemo,
  getCurrentMatch,
  resetMyMatching,
  waitForMatch,
  waitForPartnerAccept,
} from './api'
import type { DemoStep } from './api'
import { hasBlocker, runPrecheck } from './precheck'
import type { CheckResult, CheckStatus } from './precheck'
import type { MatchPair } from '@/features/matching/types'

/**
 * MVP 시연 전용 진입 화면 (FE-B).
 *
 * 시연 시나리오는 **대기방 → 5분 화상 세션 + AI 실시간 피드백 → 상호 평가 → 리포트** 인데,
 * 거기 닿으려면 원래는 트랙 선택 → 조건 입력 → 대기 큐 → 매칭 카드 수락을 거쳐야 한다.
 * 발표 중에 그 네 화면을 두 기기에서 각각 클릭하는 건 시간도 오래 걸리고 실패 지점도 많다.
 *
 * 그래서 이 화면은 **그 화면들이 부르는 API 를 버튼 하나로 순서대로 대신 호출**한다.
 * 건너뛰는 것은 매칭 *UI* 뿐이고, 매칭·세션·LiveKit·AI 코칭은 전부 실제 서버다.
 *
 * 사용법: 두 기기에서 각각 다른 계정으로 로그인한 뒤 `/demo` 에서 같이 시작을 누른다.
 *
 * ⚠️ 시연이 끝나면 이 라우트는 지운다. 운영에 나가면 안 되는 화면이다.
 */
export function DemoEntryPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [step, setStep] = useState<DemoStep>('idle')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 이미 확정돼 있는 매칭. 있으면 자동 주행 없이 바로 대기방으로 갈 수 있다. */
  const [existing, setExisting] = useState<MatchPair | null>(null)

  const [checks, setChecks] = useState<CheckResult[] | null>(null)
  const [checking, setChecking] = useState(false)

  /** 사전 점검. 발표 중에 원인을 못 찾고 헤매지 않도록 시작 전에 돌린다. */
  const runChecks = useCallback(async () => {
    setChecking(true)
    try {
      setChecks(await runPrecheck())
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void runChecks()
  }, [runChecks])

  // 자동 주행 도중 화면을 벗어나면 폴링을 멈춘다.
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  /** 들어오자마자 "이미 방이 있는지" 확인한다 — 시연 중 새로고침해도 흐름을 잃지 않는다. */
  const checkExisting = useCallback(async () => {
    const pair = await getCurrentMatch().catch(() => null)
    setExisting(pair?.session.sessionId != null ? pair : null)
  }, [])

  useEffect(() => {
    void checkExisting()
  }, [checkExisting])

  async function startDemo() {
    if (running) return
    const controller = new AbortController()
    abortRef.current = controller

    setRunning(true)
    setError(null)
    setExisting(null)

    try {
      setStep('resetting')
      await resetMyMatching()

      setStep('enqueuing')
      await enqueueForDemo()

      setStep('waiting-match')
      const matched = await waitForMatch(controller.signal)
      if (controller.signal.aborted) return
      if (!matched) {
        throw new Error(
          '상대가 큐에 들어오지 않았어요. 다른 기기에서도 시작 버튼을 눌렀는지 확인해 주세요.',
        )
      }

      setStep('accepting')
      await acceptMatch(matched.matchPairId)

      setStep('waiting-partner')
      const confirmed = await waitForPartnerAccept(controller.signal)
      if (controller.signal.aborted) return
      if (!confirmed?.session.sessionId) {
        throw new Error('상대가 아직 수락하지 않았어요. 잠시 뒤 다시 시도해 주세요.')
      }

      setStep('ready')
      navigate(`/session/${confirmed.session.sessionId}/room`)
    } catch (startError) {
      if (controller.signal.aborted) return
      setError(errorMessageOf(startError, '시연 세션을 만들지 못했어요.'))
      setStep('idle')
      void checkExisting()
    } finally {
      setRunning(false)
    }
  }

  const blocked = checks != null && hasBlocker(checks)

  function stopDemo() {
    abortRef.current?.abort()
    setRunning(false)
    setStep('idle')
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center gap-4 px-5 py-8">
      <header className="flex flex-col gap-1">
        <Cluster gap={8} style={{ alignItems: 'center' }}>
          <Icon name="bloom" size={22} style={{ color: 'var(--bt-color-brand)' }} />
          <Badge tone="warning">시연 전용</Badge>
        </Cluster>
        <h1 className="bt-h2 mt-1">화상 세션 바로 시작</h1>
        <p className="bt-body-sm bt-muted">
          매칭 화면을 건너뛰고 대기방까지 한 번에 갑니다. 세션·AI 코칭은 실제 서버로 동작해요.
        </p>
      </header>

      <Card variant="inset">
        <span className="bt-caption text-faint">현재 로그인</span>
        <p className="bt-body-sm mt-1">
          {user ? `${user.nickname} · ${user.email}` : '로그인 정보를 불러오는 중…'}
        </p>
        <p className="bt-caption bt-muted mt-2">
          두 기기가 <b>서로 다른 계정</b>으로 로그인돼 있어야 매칭이 성립해요.
        </p>
      </Card>

      <PrecheckPanel results={checks} loading={checking} onRerun={() => void runChecks()} />

      {error && <Callout tone="danger">{error}</Callout>}

      {/* 이미 방이 있으면 새로 매칭할 이유가 없다 — 그 방으로 바로 보낸다 */}
      {existing?.session.sessionId != null && !running && (
        <Callout tone="info">
          이미 확정된 매칭이 있어요 (상대: {existing.opponent.nickname}).
          <div className="mt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/session/${existing.session.sessionId}/room`)}
            >
              대기방으로 이동
            </Button>
          </div>
        </Callout>
      )}

      {running && (
        <Card>
          <Cluster gap={10} style={{ alignItems: 'center' }}>
            <Spinner />
            <span className="bt-body-sm">{DEMO_STEP_TEXT[step]}</span>
          </Cluster>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          block
          size="lg"
          loading={running}
          // 막힌 항목이 있으면 눌러도 실패한다. 누르기 전에 잠가 원인을 먼저 보게 한다.
          disabled={blocked}
          onClick={startDemo}
        >
          {running ? '진행 중…' : '시연 세션 시작'}
        </Button>
        {blocked && !running && (
          <p className="bt-caption bt-muted text-center">
            위의 <b>막힘</b> 항목을 해결해야 시작할 수 있어요.
          </p>
        )}
        {running && (
          <Button variant="ghost" block onClick={stopDemo}>
            중단
          </Button>
        )}
        <Button variant="ghost" block onClick={() => navigate('/')}>
          홈으로
        </Button>
      </div>

      <p className="bt-caption text-faint text-center">
        양쪽 기기에서 이 버튼을 누르면 몇 초 안에 매칭돼 대기방으로 넘어갑니다.
      </p>
    </div>
  )
}

/* ── 사전 점검 패널 ─────────────────────────────────────── */

const STATUS_MARK: Readonly<Record<CheckStatus, { icon: string; label: string; color: string }>> = {
  ok: { icon: '✓', label: '통과', color: 'var(--bt-color-success, #2e7d5b)' },
  warn: { icon: '!', label: '주의', color: 'var(--bt-color-warning, #b8860b)' },
  blocked: { icon: '×', label: '막힘', color: 'var(--bt-color-danger-fill, #d0455f)' },
  unknown: { icon: '?', label: '확인 필요', color: 'var(--bt-color-text-tertiary)' },
}

/**
 * 시작 전에 막힐 지점을 보여준다.
 *
 * `unknown` 을 통과로 칠하지 않는 게 핵심이다 — 못 읽은 것을 괜찮다고 표시하면
 * 사전 점검이 있으나 마나가 된다. 대신 무엇을 확인하면 되는지 적는다.
 */
function PrecheckPanel({
  results,
  loading,
  onRerun,
}: {
  results: CheckResult[] | null
  loading: boolean
  onRerun: () => void
}) {
  if (loading && results == null) {
    return (
      <Card>
        <Cluster gap={10} style={{ alignItems: 'center' }}>
          <Spinner size={18} />
          <span className="bt-body-sm">사전 점검 중…</span>
        </Cluster>
      </Card>
    )
  }
  if (!results) return null

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <b className="bt-body-sm">사전 점검</b>
        <Button variant="ghost" size="sm" loading={loading} onClick={onRerun}>
          다시 확인
        </Button>
      </div>

      <ul className="flex flex-col gap-2.5">
        {results.map((result) => {
          const mark = STATUS_MARK[result.status]
          return (
            <li key={result.id} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[3px] grid size-[17px] shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                style={{ background: mark.color }}
              >
                {mark.icon}
              </span>
              <div className="min-w-0 flex-1">
                <span className="bt-body-sm font-semibold">{result.label}</span>
                <span className="bt-caption bt-muted ml-1.5">{mark.label}</span>
                <p className="bt-caption mt-0.5">{result.detail}</p>
                {result.fix && result.status !== 'ok' && (
                  <p className="bt-caption bt-muted mt-1 break-words">→ {result.fix}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
