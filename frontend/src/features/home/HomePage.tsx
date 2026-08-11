import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  ListRowButton,
  Skeleton,
  Stack,
  TagChip,
} from '@/components'
import { resolveChatbotEntryPath } from '@/features/chatbot/api'
import { getCurrentMatch } from '@/features/matching/api'
import { isMatchClosed } from '@/features/matching/types'
import type { MatchPair } from '@/features/matching/types'
import { getSessionHistory } from '@/features/report/api'
import type { SessionHistoryItem } from '@/features/report/types'
import { useAuthStore } from '@/stores/auth.store'

/** 최근 리포트로 몇 건까지 걸지. 완성된 것만 걸러야 해서 받아오는 수는 더 크다. */
const RECENT_SHOW_COUNT = 2
const RECENT_FETCH_SIZE = 10

/* -------------------------------------------------------------------------- */
/*  W-08 · 메인 홈 (대시보드)                                                   */
/*  1차 확정 옵션:                                                             */
/*   ① 상단 네비 = 공유 AppShell 로 분리(홈은 콘텐츠만)                          */
/*   ② 사랑의 온도 = 가로 미터바   ③ 예정세션 없음 = EmptyState+CTA             */
/*   ④ AI 바로연습 = CardButton 2개  ⑤ 2단 카드 + 모바일 자동 1단(반응형)        */
/*  - 데이터는 데모 고정(백엔드 수정 중). API 자리는 TODO 로 표시.               */
/* -------------------------------------------------------------------------- */

/**
 * 예정된 세션 카드에 그릴 값.
 *
 * ⚠️ **`GET /sessions/upcoming` 은 서버에 없다.** 확정된 매칭이 곧 예정 세션이므로
 *    `GET /v1/matches/me/current`(→ `getCurrentMatch`)로 읽는다. 매칭이 없거나
 *    이미 끝난 상태면 카드 대신 EmptyState 를 그린다.
 *
 * ⚠️ 키(cm)는 넣지 않는다. **수집하지 않기로 확정된 항목**이라
 *    (`ProfilePage` W-04 확정 옵션 ②, D-08) 서버 `PublicProfileResponse` 에도 필드가 없다.
 *    데모 데이터에만 있으면 영영 채워지지 않는 칸이 화면에 남는다.
 */
interface UpcomingView {
  sessionId: number | null
  matchPairId: number
  partnerName: string
  age: string
  /** 얼굴상 · 테마 요약. 서버가 주지 않는 값은 빼고 잇는다 */
  face: string
  when: string
  /** 남은 시간. 시작 시각을 모르면 null */
  startsIn: string | null
  /** 아직 양측 수락 전인가 — 대기방 입장 대신 매칭 카드로 보낸다 */
  awaitingAcceptance: boolean
}

/**
 * 매칭 응답 → 카드 표시값.
 *
 * 확정(`CONFIRMED`)과 수락 대기(`PENDING_ACCEPTANCE`)만 예정 세션으로 본다.
 * 종료·거절·만료는 `isMatchClosed` 로 걸러지고, `COMPLETED` 는 이미 끝난 세션이라 제외한다.
 */
function toUpcomingView(pair: MatchPair | null): UpcomingView | null {
  if (!pair) return null
  if (isMatchClosed(pair.status) || pair.status === 'COMPLETED') return null

  const startAt = pair.session.scheduledStartAt
  // 얼굴상은 서버 미제공이라 대부분 null 이다. 없는 조각은 빼고 ' · ' 로 잇는다.
  const face = [pair.opponent.faceTag, pair.session.themeName && `${pair.session.themeName} 테마`]
    .filter(Boolean)
    .join(' · ')

  return {
    sessionId: pair.session.sessionId,
    matchPairId: pair.matchPairId,
    partnerName: pair.opponent.nickname,
    age: pair.opponent.ageBand,
    face,
    when: startAt ? formatWhen(startAt) : '시작 시각 조율 중',
    startsIn: startAt ? formatStartsIn(startAt) : null,
    awaitingAcceptance: pair.status === 'PENDING_ACCEPTANCE',
  }
}

/** "오늘 19:00" · "8월 7일 19:00". 오늘이면 날짜를 생략해 한 줄을 짧게 둔다. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (sameDay) return `오늘 ${time}`
  return `${date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${time}`
}

/** 리포트 날짜. 확정 문서라 상대 시간("2일 전")을 쓰지 않는다 — 목록 화면과 같은 규칙이다. */
function formatReportDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

/** "2시간 12분 뒤". 이미 지났으면 '곧 시작'. */
function formatStartsIn(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(diffMs) || diffMs <= 0) return '곧 시작'
  const totalMin = Math.floor(diffMs / 60_000)
  const days = Math.floor(totalMin / (60 * 24))
  if (days >= 1) return `${days}일 뒤`
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours >= 1) return `${hours}시간 ${minutes}분 뒤`
  return `${Math.max(1, minutes)}분 뒤`
}

/** 사랑의 온도 미터바. 36.5 기준, 30~42 범위를 게이지로. (전용 컴포넌트 없어 페이지 로컬) */
function LoveTemperatureMeter({ value, delta }: { value: number; delta: number }) {
  const pct = Math.max(0, Math.min(100, ((value - 30) / (42 - 30)) * 100))
  return (
    <div>
      <div className="flex items-end gap-2">
        <span className="bt-numeric text-[32px] font-extrabold leading-none tracking-[-0.02em] text-brand">
          {value.toFixed(1)}
          <span className="text-[18px]">°</span>
        </span>
        <Badge tone="success">▲ {delta.toFixed(1)}</Badge>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={30}
        aria-valuemax={42}
        aria-label={`사랑의 온도 ${value.toFixed(1)}도`}
      >
        <div
          className="h-full rounded-full"
          style={
            {
              width: `${pct}%`,
              background: 'linear-gradient(90deg, var(--bt-pollen-500), var(--bt-rose-500))',
            } as CSSProperties
          }
        />
      </div>
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [upcoming, setUpcoming] = useState<UpcomingView | null>(null)
  const [upcomingLoading, setUpcomingLoading] = useState(true)

  const [recent, setRecent] = useState<SessionHistoryItem[]>([])
  const [recentLoading, setRecentLoading] = useState(true)

  // 챗봇 진입은 목적지를 조회한 뒤 이동한다 — 그동안 버튼을 잠근다.
  const [chatEntering, setChatEntering] = useState(false)

  useEffect(() => {
    let alive = true
    // 홈에는 **완성된 리포트만** 건다. 생성 중·실패까지 요약에 섞으면 무엇을 눌러야 할지
    // 판단할 정보가 부족해진다 — 그 사유는 '/reports' 목록이 설명한다.
    getSessionHistory({ size: RECENT_FETCH_SIZE })
      .then((page) => {
        if (!alive) return
        setRecent(
          page.sessions
            .filter((s) => s.report?.exists === true && s.report.status === 'COMPLETED')
            .slice(0, RECENT_SHOW_COUNT),
        )
      })
      .catch(() => {
        // 리포트가 없는 것은 정상 상태다 — 실패해도 홈을 막지 않는다.
        if (alive) setRecent([])
      })
      .finally(() => {
        if (alive) setRecentLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    // 예정 세션이 없는 것은 정상 상태다 — 실패해도 홈을 막지 않고 EmptyState 로 둔다.
    getCurrentMatch()
      .then((pair) => {
        if (alive) setUpcoming(toUpcomingView(pair))
      })
      .catch(() => {
        if (alive) setUpcoming(null)
      })
      .finally(() => {
        if (alive) setUpcomingLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const heroTarget = upcoming
    ? upcoming.awaitingAcceptance || upcoming.sessionId == null
      ? `/matching/pair/${upcoming.matchPairId}`
      : `/session/${upcoming.sessionId}/room`
    : '/matching'
  const heroAction = upcoming
    ? upcoming.awaitingAcceptance
      ? '매칭 확인하기'
      : '대기방 입장'
    : '새 매칭 시작'
  const heroStatus = upcomingLoading
    ? '오늘의 일정을 확인하고 있어요.'
    : upcoming
      ? `${upcoming.partnerName} 님과 ${upcoming.when}에 만나요.`
      : '아직 예정된 세션이 없어요. 새로운 대화를 준비해볼까요?'

  return (
    <main className="tk-brand-scope tk-home-page">
      <section className="tk-home-hero" aria-labelledby="home-hero-title">
        <div className="tk-home-hero__media">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/hero-couple.webp"
            aria-hidden="true"
          >
            <source src="/main_hero_video.mp4" type="video/mp4" />
          </video>
          <div className="tk-home-hero__scrim" aria-hidden="true" />
          <div className="tk-home-hero__mark" aria-hidden="true">
            <img src="/tika-logo-whitever.webp" alt="" width={82} height={48} />
            <span>티키타카</span>
          </div>
          <div className="tk-home-hero__desktop-copy">
            <p>Practice · Connect · Bloom</p>
            <h1 id="home-hero-title">
              좋은 대화는,
              <br />
              연습할수록
              <br />
              자연스러워져요.
            </h1>
          </div>
        </div>

        <div className="tk-home-cta-sheet">
          <p className="tk-home-cta-sheet__eyebrow">
            {user?.nickname ? `${user.nickname} 님의 오늘` : '오늘의 티키타카'}
          </p>
          <h2>오늘도 한 걸음, <br />연습해볼까요?</h2>
          <p className="tk-home-cta-sheet__status">{heroStatus}</p>
          <Button variant="primary" size="lg" block onClick={() => navigate(heroTarget)}>
            {heroAction}
          </Button>
          <span className="tk-home-cta-sheet__note">30분 화상 세션 · 매칭 시 알림</span>
        </div>
      </section>

      <div className="tk-home-content">
        <section className="tk-home-grid" aria-label="오늘의 활동">
          {upcomingLoading ? (
            <Card className="tk-home-session-card">
              <Stack gap={12}>
                <Skeleton width={140} height={24} />
                <Skeleton height={72} />
                <Skeleton height={44} />
              </Stack>
            </Card>
          ) : upcoming ? (
            <Card className="tk-home-session-card">
              <div className="tk-home-section-heading">
                <div>
                  <span>Next conversation</span>
                  <h2>예정된 세션</h2>
                </div>
                {upcoming.startsIn && <Badge tone="warning">{upcoming.startsIn}</Badge>}
              </div>

              <div className="tk-home-session-card__person">
                <Avatar size="md" name={upcoming.partnerName} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{upcoming.partnerName} 님</b>
                    <TagChip>{upcoming.age}</TagChip>
                  </div>
                  <p>{[upcoming.face, upcoming.when].filter(Boolean).join(' · ')}</p>
                </div>
              </div>

              <Callout tone="info">
                시작 1시간 전까지 취소하면 패널티가 없어요. 편안하게 준비해 주세요.
              </Callout>
              <div className="tk-home-actions">
                <Button variant="primary" onClick={() => navigate(heroTarget)}>
                  {heroAction}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/matching/pair/${upcoming.matchPairId}`)}
                >
                  일정 상세
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="tk-home-session-card tk-home-session-card--empty">
              <EmptyState
                icon={<Icon name="clock" size={30} />}
                title="예정된 세션이 없어요"
                text="지금 매칭을 신청하면 새로운 대화가 여기에 이어져요."
                action={
                  <Button variant="primary" size="sm" onClick={() => navigate('/matching')}>
                    새 매칭 시작
                  </Button>
                }
              />
            </Card>
          )}

          <Card className="tk-home-temperature-card">
            <div className="tk-home-section-heading">
              <div>
                <span>My progress</span>
                <h2>사랑의 온도</h2>
              </div>
            </div>
            <LoveTemperatureMeter value={38.2} delta={1.7} />
            <p className="bt-caption mt-3">최근 세션 이후 1.7° 올랐어요. 작은 변화가 쌓이고 있습니다.</p>
            <dl className="tk-home-stats">
              <div>
                <dt>완료한 연습</dt>
                <dd>7</dd>
              </div>
              <div>
                <dt>노쇼</dt>
                <dd>0</dd>
              </div>
            </dl>
          </Card>
        </section>

        <section className="tk-home-practice" aria-labelledby="practice-title">
          <div className="tk-home-practice__copy">
            <span>Choose your pace</span>
            <h2 id="practice-title">내 속도에 맞는 연습</h2>
            <p>사람과 만나도, AI와 가볍게 시작해도 좋아요.</p>
          </div>
          <div className="tk-home-practice__actions">
            <button type="button" onClick={() => navigate('/matching')}>
              <span aria-hidden="true">01</span>
              <b>실사용자 매칭</b>
              <small>30분 · 매칭 시 알림</small>
            </button>
            {/* AI 화상 연습(W-21) — 상대 없이 5분간 혼자 말하는 연습이라 시간을 5분으로 둔다.
                '15분'은 서버 대화가 붙는 것을 전제한 값이었다. */}
            <button type="button" onClick={() => navigate('/ai-video/setup')}>
              <span aria-hidden="true">02</span>
              <b>AI 화상 연습</b>
              <small>5분 · 대기 없음</small>
            </button>
            {/* 진행 중 대화가 있으면 그 대화로, 없으면 페르소나 설정으로 —
                목적지를 조회하는 동안 버튼을 잠근다. */}
            <button
              type="button"
              disabled={chatEntering}
              onClick={() => {
                if (chatEntering) return
                setChatEntering(true)
                void resolveChatbotEntryPath()
                  .then((path) => navigate(path))
                  .finally(() => setChatEntering(false))
              }}
            >
              <span aria-hidden="true">03</span>
              <b>AI 챗봇</b>
              <small>{chatEntering ? '여는 중…' : '텍스트로 가볍게'}</small>
            </button>
          </div>
        </section>

        <section className="tk-home-reports" aria-labelledby="recent-report-title">
          <div className="tk-home-section-heading">
            <div>
              <span>Look back</span>
              <h2 id="recent-report-title">최근 리포트</h2>
            </div>
            {recent.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
                전체 보기
              </Button>
            )}
          </div>
          {recentLoading ? (
            <div className="tk-home-report-list">
              <Skeleton height={64} />
              <Skeleton height={64} />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<Icon name="sparkle" size={24} />}
              title="아직 리포트가 없어요"
              text="첫 세션을 마치면 대화의 강점과 다음 연습 포인트가 쌓여요."
            />
          ) : (
            <div className="tk-home-report-list">
              {recent.map((item) => (
                <ListRowButton
                  key={item.sessionId}
                  leading={<Avatar size="sm" name={item.partnerAlias ?? 'AI'} />}
                  title={item.partnerAlias ? `${item.partnerAlias} 님과의 세션` : '세션'}
                  meta={formatReportDate(item.endedAt ?? item.startedAt)}
                  onClick={() => navigate(`/session/${item.sessionId}/report`)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
