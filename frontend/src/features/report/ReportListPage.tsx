import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card, EmptyState, Icon, ListRowButton, Segmented, Skeleton } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getChatSessions } from '@/features/chatbot/api'
import { STAGE_LABEL } from '@/features/chatbot/types'
import type { AiChatSession, ConversationStage } from '@/features/chatbot/types'
import { getSessionDetail } from '@/features/session/api'
import { useAuthStore } from '@/stores/auth.store'
import { getSessionHistory } from './api'
import type { SessionHistoryItem, SessionHistoryPage } from './types'

/* -------------------------------------------------------------------------- */
/*  지난 리포트 (`/reports`)                                                    */
/*                                                                            */
/*  두 트랙을 한 화면에서 나눈다 — 화상 세션과 AI 챗봇은 리포트의 성격도 경로도   */
/*  다르다(`/session/:id/report` vs `/chatbot/:id/report`).                     */
/*  선택은 `?track=` 에 남긴다: 주소로 공유·북마크되고 뒤로가기가 동작한다.       */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20

type Track = 'session' | 'chat'

const TRACK_OPTIONS = [
  { value: 'session', label: '화상 세션' },
  { value: 'chat', label: 'AI 챗봇' },
]

function parseTrack(value: string | null): Track {
  return value === 'chat' ? 'chat' : 'session'
}

export function ReportListPage() {
  const [params, setParams] = useSearchParams()
  const track = parseTrack(params.get('track'))

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-6">
      <header className="mb-5">
        <h1 className="bt-h2">지난 리포트</h1>
        <p className="bt-body-sm bt-muted mt-1">
          세션과 대화가 끝나면 자동으로 만들어져요. 점수는 대화 행동에만 붙어요.
        </p>
        <Segmented
          className="mt-4"
          aria-label="리포트 종류"
          options={TRACK_OPTIONS}
          value={track}
          // replace: 탭 전환이 뒤로가기 기록을 채우면 목록을 빠져나가기 어려워진다.
          onChange={(next) => setParams({ track: next }, { replace: true })}
        />
      </header>

      {track === 'session' ? <SessionTrack /> : <ChatTrack />}
    </main>
  )
}

/* ── 화상 세션 ─────────────────────────────────────────── */

function SessionTrack() {
  const navigate = useNavigate()
  const myUserId = useAuthStore((s) => s.user?.id ?? null)

  const [items, setItems] = useState<SessionHistoryItem[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** sessionId → 상대 닉네임. 목록 응답이 '익명 상대' 고정이라 따로 채운다(아래 주석). */
  const [names, setNames] = useState<Record<number, string>>({})

  /**
   * 상대 닉네임 채우기.
   *
   * ⚠️ `GET /v1/growth/sessions` 의 `partnerAlias` 는 서버에서 **`"익명 상대"` 로 하드코딩**돼
   *    있다(`GrowthSessionQueryService`). 그대로 그리면 목록이 전부 같은 이름이 된다.
   *    세션 상세(`GET /v1/sessions/{id}`)에는 참가자 닉네임이 있으므로 그걸로 채운다.
   *
   * 한 화면치(최대 20건)를 병렬로 부른다. 실패한 건만 기본 문구로 남고 목록은 그대로 뜬다.
   * TODO(BE): 목록 응답이 닉네임을 주면 이 보정을 지운다 — 세션당 1회 추가 요청이 사라진다.
   */
  const fillNames = useCallback(
    async (rows: SessionHistoryItem[]) => {
      if (myUserId == null) return
      const targets = rows.filter((row) => names[row.sessionId] == null)
      if (targets.length === 0) return
      const resolved = await Promise.all(
        targets.map(async (row) => {
          try {
            const detail = await getSessionDetail(row.sessionId)
            const partner = detail.participants.find((p) => String(p.userId) !== myUserId)
            return [row.sessionId, partner?.nickname ?? null] as const
          } catch {
            return [row.sessionId, null] as const
          }
        }),
      )
      setNames((prev) => {
        const next = { ...prev }
        for (const [sessionId, nickname] of resolved) {
          if (nickname) next[sessionId] = nickname
        }
        return next
      })
    },
    [myUserId, names],
  )

  const apply = useCallback((page: SessionHistoryPage, append: boolean) => {
    setItems((prev) => (append ? [...prev, ...page.sessions] : page.sessions))
    setCursor(page.nextCursor)
    setHasNext(page.hasNext)
    return page.sessions
  }, [])

  const loadFirst = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await getSessionHistory({ size: PAGE_SIZE })
      void fillNames(apply(page, false))
    } catch (loadError) {
      setError(errorMessageOf(loadError, '리포트 목록을 불러오지 못했어요.'))
    } finally {
      setLoading(false)
    }
    // fillNames 는 names 가 바뀔 때마다 새로 만들어진다 — 여기 넣으면 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  async function loadMore() {
    if (loadingMore || !hasNext || cursor == null) return
    setLoadingMore(true)
    try {
      const page = await getSessionHistory({ cursor, size: PAGE_SIZE })
      void fillNames(apply(page, true))
    } catch (loadError) {
      // 더 불러오기 실패는 이미 보이는 목록을 지우지 않는다 — 오류 줄만 세운다.
      setError(errorMessageOf(loadError, '다음 목록을 불러오지 못했어요.'))
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <ListSkeleton />

  if (items.length === 0) {
    return (
      <EmptyCard
        text={error ?? '첫 세션을 마치면 여기에 쌓여요.'}
        actionLabel={error ? '다시 시도' : '매칭하러 가기'}
        onAction={() => (error ? void loadFirst() : navigate('/matching'))}
      />
    )
  }

  return (
    <Card>
      <div>
        {items.map((item) => (
          <SessionRow
            key={item.sessionId}
            item={item}
            partnerName={names[item.sessionId] ?? null}
            onOpen={navigate}
          />
        ))}
      </div>

      {error && <ErrorLine text={error} />}
      {hasNext && <MoreButton loading={loadingMore} onClick={() => void loadMore()} />}
    </Card>
  )
}

/**
 * 한 줄. **리포트가 있을 때만 누를 수 있다.**
 *
 * 없는 세션까지 누르게 두면 리포트 화면의 '준비 중' 안내로 보내는 셈인데, 그건 목록에서
 * 이미 말해줄 수 있는 정보라 왕복이 낭비다. 대신 왜 없는지를 meta 에 적는다.
 */
function SessionRow({
  item,
  partnerName,
  onOpen,
}: {
  item: SessionHistoryItem
  /** 세션 상세에서 채운 실제 닉네임. 아직 못 받았으면 null */
  partnerName: string | null
  onOpen: (to: string) => void
}) {
  const openable = item.report?.exists === true && item.report.status === 'COMPLETED'
  // 서버가 주는 partnerAlias('익명 상대')는 쓰지 않는다 — 모든 줄이 같은 이름이 된다.
  const name = partnerName ?? '상대'
  const title = `${name}님과의 세션`
  const meta = [
    formatWhen(item.endedAt ?? item.startedAt),
    durationText(item.durationSeconds),
    reportStateText(item),
  ]
    .filter(Boolean)
    .join(' · ')

  if (!openable) {
    return (
      <div className="bt-row" aria-disabled="true">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="sm" name={name} />
          <div className="min-w-0">
            <div className="bt-body-sm truncate" style={{ color: 'var(--bt-color-text-secondary)' }}>
              {title}
            </div>
            <div className="bt-caption bt-muted truncate">{meta}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ListRowButton
      leading={<Avatar size="sm" name={name} />}
      title={title}
      meta={meta}
      onClick={() => onOpen(`/session/${item.sessionId}/report`)}
    />
  )
}

/* ── AI 챗봇 ───────────────────────────────────────────── */

/**
 * 챗봇 대화 목록.
 *
 * 연습 단계(소개팅 전/후)는 이제 **서버가 안다** — 세션 생성이 그 값을 `purpose` 로
 * 받아 저장하고, 목록도 `?purpose=` 로 걸러 준다. 그래서 분류 기준으로 쓸 수 있다.
 *
 * ⚠️ 단, 단계 도입 **이전에 만들어진 대화**는 서버에 `DATE_PRACTICE` 로 남아 있어
 *    어느 쪽에도 잡히지 않는다. 그 대화를 잃어버리지 않도록 `전체` 를 기본 탭으로 두고,
 *    걸렀을 때만 안내 문구를 띄운다.
 */

/** 챗봇 하위 필터. `all` 은 레거시 대화까지 포함한다. */
type ChatFilter = 'all' | ConversationStage

const CHAT_FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'BEFORE_DATE', label: STAGE_LABEL.BEFORE_DATE },
  { value: 'AFTER_DATE', label: STAGE_LABEL.AFTER_DATE },
]

function ChatTrack() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [items, setItems] = useState<AiChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getChatSessions(filter === 'all' ? undefined : filter)
      // 최신순. 서버 정렬을 가정하지 않는다.
      setItems([...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
    } catch (loadError) {
      setError(errorMessageOf(loadError, '대화 목록을 불러오지 못했어요.'))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const picker = (
    <Segmented
      className="mb-4"
      aria-label="연습 단계"
      options={CHAT_FILTER_OPTIONS}
      value={filter}
      onChange={(next) => setFilter(next as ChatFilter)}
    />
  )

  if (loading) {
    return (
      <>
        {picker}
        <ListSkeleton />
      </>
    )
  }

  if (items.length === 0) {
    return (
      <>
        {picker}
        <EmptyCard
          text={
            error ??
            (filter === 'all'
              ? 'AI 챗봇으로 대화를 연습하면 여기에 쌓여요.'
              : `${STAGE_LABEL[filter]} 대화가 아직 없어요.`)
          }
          actionLabel={error ? '다시 시도' : '챗봇 연습하기'}
          onAction={() => (error ? void load() : navigate('/chatbot/persona'))}
        />
      </>
    )
  }

  return (
    <>
      {picker}
      <Card>
        <div>
          {items.map((chat) => (
            <ChatRow key={chat.chatSessionId} chat={chat} onOpen={navigate} />
          ))}
        </div>
        {error && <ErrorLine text={error} />}
      </Card>
      {filter !== 'all' && (
        <p className="bt-caption bt-muted mt-3">
          단계를 고르기 전에 시작한 예전 대화는 <b>전체</b>에서만 보여요.
        </p>
      )}
    </>
  )
}

/**
 * 대화 한 줄.
 *
 * 끝난 대화는 종합 피드백으로, 진행 중인 대화는 대화 화면으로 보낸다 —
 * 진행 중인 대화에는 아직 피드백이 없다.
 */
function ChatRow({ chat, onOpen }: { chat: AiChatSession; onOpen: (to: string) => void }) {
  const done = chat.status === 'COMPLETED'
  const meta = [
    formatWhen(chat.completedAt ?? chat.startedAt),
    STAGE_LABEL[chat.stage],
    done ? '피드백 보기' : chat.status === 'ACTIVE' ? '이어서 대화하기' : '중단된 대화',
  ]
    .filter(Boolean)
    .join(' · ')

  if (chat.status === 'CANCELLED') {
    return (
      <div className="bt-row" aria-disabled="true">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="sm" name={chat.persona.name} fallback={chat.persona.emoji ?? '🙂'} />
          <div className="min-w-0">
            <div className="bt-body-sm truncate" style={{ color: 'var(--bt-color-text-secondary)' }}>
              {chat.persona.name}님과의 대화
            </div>
            <div className="bt-caption bt-muted truncate">{meta}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ListRowButton
      leading={<Avatar size="sm" name={chat.persona.name} fallback={chat.persona.emoji ?? '🙂'} />}
      title={`${chat.persona.name}님과의 대화`}
      meta={meta}
      trailing={!done ? <Badge tone="warning">진행 중</Badge> : undefined}
      onClick={() =>
        onOpen(done ? `/chatbot/${chat.chatSessionId}/report` : `/chatbot/${chat.chatSessionId}`)
      }
    />
  )
}

/* ── 공통 조각 ─────────────────────────────────────────── */

function EmptyCard({
  text,
  actionLabel,
  onAction,
}: {
  text: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <Card>
      <EmptyState
        icon={<Icon name="sparkle" size={28} style={{ color: 'var(--bt-color-text-tertiary)' }} />}
        title="아직 리포트가 없어요"
        text={text}
        action={
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        }
      />
    </Card>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="bt-caption mt-3 text-center" style={{ color: 'var(--bt-color-danger)' }}>
      {text}
    </p>
  )
}

function MoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div className="mt-3 flex justify-center">
      <Button variant="secondary" size="sm" loading={loading} onClick={onClick}>
        더 보기
      </Button>
    </div>
  )
}

/* ── 표시 문구 ─────────────────────────────────────────── */

/**
 * 리포트 상태를 사람 말로. **없는 이유를 구분해 적는다** —
 * "아직 만드는 중"과 "만들지 못함"은 사용자가 할 일이 다르다(기다리기 vs 다시 시도).
 */
function reportStateText(item: SessionHistoryItem): string {
  if (item.status === 'TERMINATED') return '중단된 세션'
  const report = item.report
  if (!report || !report.exists) return '리포트 없음'
  switch (report.status) {
    case 'COMPLETED':
      return '리포트 보기'
    case 'PENDING':
    case 'GENERATING':
      return '리포트 생성 중'
    case 'FAILED':
      return '리포트 생성 실패'
    default:
      return '리포트 없음'
  }
}

/** 세션 길이. 1분 미만은 '1분 미만'으로 — '0분'은 안 한 것처럼 읽힌다. */
function durationText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const minutes = Math.floor(seconds / 60)
  return minutes < 1 ? '1분 미만' : `${minutes}분`
}

/** 날짜. 리포트는 확정 문서라 상대 시간("2일 전")을 쓰지 않는다. */
function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

function ListSkeleton() {
  return (
    <Card aria-busy="true">
      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={44} />
        ))}
      </div>
    </Card>
  )
}
