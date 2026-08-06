import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Button, Card, EmptyState, Icon, ListRowButton, Skeleton } from '@/components'
import { errorMessageOf } from '@/shared/api/envelope'
import { getSessionHistory } from './api'
import type { SessionHistoryItem, SessionHistoryPage } from './types'

/* -------------------------------------------------------------------------- */
/*  지난 리포트 목록 (`/reports`)                                               */
/*                                                                            */
/*  ⚠️ 리포트 전용 목록 엔드포인트가 없다. `GET /v1/growth/sessions` 가 세션      */
/*     이력에 `report: { exists, reportId, status }` 를 함께 주므로 그걸 쓴다.   */
/*                                                                            */
/*  리포트가 없는 세션도 **숨기지 않는다.** 목록에서 빼면 "분명 했는데 왜 없지"가  */
/*  되고, 남기면 생성 중인지 실패했는지를 그 자리에서 설명할 수 있다.             */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20

export function ReportListPage() {
  const navigate = useNavigate()

  const [items, setItems] = useState<SessionHistoryItem[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((page: SessionHistoryPage, append: boolean) => {
    setItems((prev) => (append ? [...prev, ...page.sessions] : page.sessions))
    setCursor(page.nextCursor)
    setHasNext(page.hasNext)
  }, [])

  const loadFirst = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      apply(await getSessionHistory({ size: PAGE_SIZE }), false)
    } catch (loadError) {
      setError(errorMessageOf(loadError, '리포트 목록을 불러오지 못했어요.'))
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  async function loadMore() {
    if (loadingMore || !hasNext || cursor == null) return
    setLoadingMore(true)
    try {
      apply(await getSessionHistory({ cursor, size: PAGE_SIZE }), true)
    } catch (loadError) {
      // 더 불러오기 실패는 이미 보이는 목록을 지우지 않는다 — 오류 줄만 세운다.
      setError(errorMessageOf(loadError, '다음 목록을 불러오지 못했어요.'))
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <ListSkeleton />

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-6">
      <header className="mb-5">
        <h1 className="bt-h2">지난 리포트</h1>
        <p className="bt-body-sm bt-muted mt-1">
          세션이 끝나면 자동으로 만들어져요. 점수는 대화 행동에만 붙어요.
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="sparkle" size={28} style={{ color: 'var(--bt-color-text-tertiary)' }} />}
            title="아직 리포트가 없어요"
            text={error ?? '첫 세션을 마치면 여기에 쌓여요.'}
            action={
              <Button variant="primary" onClick={() => navigate(error ? '/reports' : '/matching')}>
                {error ? '다시 시도' : '매칭하러 가기'}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div>
            {items.map((item) => (
              <SessionRow key={item.sessionId} item={item} onOpen={navigate} />
            ))}
          </div>

          {error && (
            <p className="bt-caption mt-3 text-center" style={{ color: 'var(--bt-color-danger)' }}>
              {error}
            </p>
          )}

          {hasNext && (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                더 보기
              </Button>
            </div>
          )}
        </Card>
      )}
    </main>
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
  onOpen,
}: {
  item: SessionHistoryItem
  onOpen: (to: string) => void
}) {
  const openable = item.report?.exists === true && item.report.status === 'COMPLETED'
  const title = item.partnerAlias ? `${item.partnerAlias} 님과의 세션` : '세션'
  const meta = [formatWhen(item.endedAt ?? item.startedAt), durationText(item.durationSeconds), reportStateText(item)]
    .filter(Boolean)
    .join(' · ')

  if (!openable) {
    return (
      <div className="bt-row" aria-disabled="true">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="sm" name={item.partnerAlias ?? 'AI'} />
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
      leading={<Avatar size="sm" name={item.partnerAlias ?? 'AI'} />}
      title={title}
      meta={meta}
      onClick={() => onOpen(`/session/${item.sessionId}/report`)}
    />
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
    <main className="mx-auto w-full max-w-[720px] px-5 pb-10 pt-6" aria-busy="true">
      <Skeleton width={160} height={30} />
      <Card className="mt-5">
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      </Card>
    </main>
  )
}
