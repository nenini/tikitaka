import { Icon } from '@/components'
import type { IconName } from '@/components'
import type { CoachMessage, CoachTone } from '@/stores/coaching.store'

/** 톤별 표시. 색만으로 구분하지 않는다 — 아이콘과 라벨을 함께 준다(색각 이상 대응). */
const TONE_META: Record<CoachTone, { icon: IconName; label: string }> = {
  positive: { icon: 'check-circle', label: '잘 되고 있어요' },
  negative: { icon: 'sparkle', label: '이렇게 해볼까요' },
  neutral: { icon: 'info-circle', label: '참고해 주세요' },
}

export interface CoachHistoryCardProps {
  /** 최신이 앞인 코칭 기록 */
  history: readonly CoachMessage[]
  /** 세션 시작 시각(ms). 각 코칭이 몇 분쯤에 왔는지 표시하는 데 쓴다 */
  sessionStartedAtMs?: number | null
}

/**
 * 지나간 코칭 기록 (§10 코치 레일).
 *
 * 영상 위 오버레이는 몇 초 뒤 사라진다. 그게 유일한 사본이면 **눈을 돌린 사이 조언이
 * 통째로 증발한다** — 상대 얼굴을 보는 게 이 서비스의 목적이라 그럴 일이 잦다.
 * 여기에 최신순으로 쌓아 두고 언제든 다시 읽게 한다.
 *
 * 🔒 레일 전체가 본인 화면 전용이다(상대에게 전송되지 않는다).
 *
 * ⚠️ 오버레이와 **같은 문장이 두 곳에 보인다.** 의도한 중복이다 — 오버레이는 지금
 *    반응해야 할 신호이고, 여기는 되짚어보는 기록이다. 역할이 달라 하나로 합치지 않는다.
 */
export function CoachHistoryCard({ history, sessionStartedAtMs }: CoachHistoryCardProps) {
  if (history.length === 0) {
    return (
      <div className="bt-coach-history">
        <div className="bt-coach-history__head">
          <span className="bt-h3">코칭 기록</span>
        </div>
        <p className="bt-caption bt-muted">
          대화가 시작되면 여기에 쌓여요. 놓친 조언도 다시 읽을 수 있어요.
        </p>
      </div>
    )
  }

  return (
    <div className="bt-coach-history">
      <div className="bt-coach-history__head">
        <span className="bt-h3">코칭 기록</span>
        <span className="bt-caption bt-muted bt-numeric">{history.length}</span>
      </div>

      {/* 최신이 위. 새 코칭이 오면 시선이 이미 가 있는 자리에 들어온다 */}
      <ol className="bt-coach-history__list">
        {history.map((message) => (
          <li key={message.id} className={`bt-coach-history__item bt-coach-history__item--${message.tone}`}>
            <div className="bt-coach-history__meta">
              <Icon name={TONE_META[message.tone].icon} size={13} />
              <span>{TONE_META[message.tone].label}</span>
              {sessionStartedAtMs != null && (
                <time className="bt-numeric" dateTime={new Date(message.at).toISOString()}>
                  {formatElapsed(message.at - sessionStartedAtMs)}
                </time>
              )}
            </div>
            {/* 기록에서는 자르지 않는다 — 오버레이를 놓친 사람이 오는 곳이다 */}
            <p className="bt-coach-history__text">{message.text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 세션 경과 "12:34". 음수(시작 전 도착)는 0 으로 눌러 표시한다. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
