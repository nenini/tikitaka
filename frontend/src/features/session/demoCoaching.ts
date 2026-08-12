import { useCallback, useEffect, useRef } from 'react'
import { useCoachingStore } from '@/stores/coaching.store'
import type { CoachMessageInput } from '@/stores/coaching.store'

/* -------------------------------------------------------------------------- */
/*  시연용 코칭 (발표 전용)                                                     */
/*                                                                            */
/*  발표에서 코칭 카드는 침묵 10초·표정·시선 같은 **실제 감지**로 뜬다. 그래서       */
/*  2분짜리 시연에서 원하는 코칭이 원하는 순서로 나올 보장이 없고, AI 워커·LiveKit   */
/*  연결·GPU 지연 중 하나만 삐끗하면 아무것도 안 뜬다.                            */
/*                                                                            */
/*  시연 모드에서는 자동 코칭을 끄고, 발표자가 키를 눌러 **정해둔 순서대로** 띄운다.  */
/*  카드는 실제 코칭과 똑같은 스토어·컴포넌트를 지나므로 화면에 보이는 결과는 같다.   */
/* -------------------------------------------------------------------------- */

/** 시연 모드 래치. 세션 화면은 앱 내부 이동으로 들어와 쿼리가 사라지므로 탭 단위로 기억한다. */
const FLAG_KEY = 'tk.demo-coaching'

/** 발표자가 누르는 키. 화면에는 아무 표시도 하지 않는다. */
export const DEMO_COACHING_KEY = ']'

/**
 * `?demo=1` 을 탭에 기억시킨다. **앱 부팅 때 한 번 호출한다**(`main.tsx`).
 *
 * ⚠️ 이걸 `isDemoCoaching()` 안에서 하면 안 된다. 그 함수는 세션 화면에서만 불리는데
 *    `/session/{id}` 는 대기방에서 `navigate()` 로 들어와 **쿼리가 이미 사라진 뒤**다.
 *    그래서 홈에서 `?demo=1` 로 열어도 래치 코드가 한 번도 돌지 않아 항상 꺼져 있었다.
 *    쿼리를 읽을 수 있는 건 **페이지가 로드되는 그 순간뿐**이므로 진입점에서 처리한다.
 *
 * 끄려면 `?demo=0` 으로 열거나 탭을 닫는다.
 */
export function latchDemoCoaching(): void {
  try {
    const param = new URLSearchParams(window.location.search).get('demo')
    if (param === '1') sessionStorage.setItem(FLAG_KEY, '1')
    if (param === '0') sessionStorage.removeItem(FLAG_KEY)
  } catch {
    /* 스토리지를 못 쓰는 환경이면 시연 모드가 아닌 것으로 둔다 */
  }
}

/**
 * 시연 모드인가. 래치된 플래그만 읽는다(래치는 `latchDemoCoaching()` 이 한다).
 *
 * ⚠️ 이 값이 false 면 키 입력을 아예 받지 않고 자동 코칭도 평소대로 동작한다.
 *    실제 사용자가 우연히 이 키를 눌러 가짜 코칭을 보는 일이 없어야 한다.
 */
export function isDemoCoaching(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1'
  } catch {
    // 스토리지를 못 쓰는 환경이면 시연 모드가 아닌 것으로 본다(실사용을 건드리지 않는 쪽).
    return false
  }
}

/**
 * 키가 순서대로 돌리는 **자동 감지** 코칭. 배열 순서가 곧 발표 순서다.
 *
 * 질문 추천은 여기 넣지 않는다 — 실제 제품에서도 앞의 둘은 서버가 감지해 보내고
 * 질문 추천은 사용자가 버튼으로 요청하는 것이라 **트리거가 다르다.** 섞어 두면
 * 버튼으로 보여준 카드가 키를 계속 누를 때 한 번 더 나온다.
 *
 * `tone` 은 코치 레일 기록의 라벨·색을 정한다(카드 본문에는 영향이 없다).
 * 표시 시간을 길게 두는 이유는 발표자가 설명하는 동안 카드가 사라지면 안 되기 때문이다 —
 * 스토어는 `triggeredAt`/`expiresAt` 의 차이를 표시 시간으로 쓴다.
 */
export const DEMO_COACHING_SCRIPT: readonly CoachMessageInput[] = [
  {
    // ① 화면 응시
    tone: 'negative',
    text: '시선이 화면 아래로 자주 내려가고 있어요. 카메라를 조금 더 봐주세요.',
    priority: 'MEDIUM',
    triggeredAtSessionElapsedMs: 0,
    expiresAtSessionElapsedMs: 20_000,
  },
  {
    // ② 미소
    tone: 'negative',
    text: '표정이 조금 굳어 있어요. 가볍게 미소를 지어보세요.',
    priority: 'MEDIUM',
    triggeredAtSessionElapsedMs: 0,
    expiresAtSessionElapsedMs: 20_000,
  },
]

/**
 * `질문 추천받기` 버튼이 띄우는 LLM 기반 코칭. **키 순서에는 들어가지 않는다.**
 *
 * 사용자가 직접 요청한 추천이라 지적이 아니므로 `neutral` 이다
 * (`toCoachTone` 의 `QUESTION_SUGGESTION` 과 같은 판단).
 */
export const DEMO_LLM_SUGGESTION: CoachMessageInput = {
  tone: 'neutral',
  text: 'ISTP가 어떤 MBTI 성향인지 물어보는 건 어떨까요?',
  priority: 'MEDIUM',
  triggeredAtSessionElapsedMs: 0,
  expiresAtSessionElapsedMs: 20_000,
}

export interface DemoCoaching {
  /**
   * `질문 추천받기` 버튼이 부를 함수. 시연 모드가 아니면 null 이므로
   * 호출부는 이 값으로 "서버를 부를지 / 대본을 띄울지"를 가른다.
   */
  showLlmSuggestion: (() => void) | null
}

/**
 * 시연용 코칭 재생기.
 *
 * - 키(`DEMO_COACHING_KEY`)를 누르면 자동 감지 대본을 **순서대로** 하나씩 띄운다.
 * - `질문 추천받기` 버튼은 순서와 무관하게 **LLM 항목**을 띄운다(대본에 없는 별개 카드).
 *
 * 키는 마지막까지 가면 더 이상 반응하지 않는다 — 처음부터 되돌리면 발표 중 잘못 눌렀을 때
 * 이미 지나간 코칭이 다시 나와 더 헷갈린다. 버튼은 몇 번이든 같은 카드를 띄운다.
 *
 * 화면에는 아무것도 그리지 않는다.
 */
export function useDemoCoaching(enabled: boolean): DemoCoaching {
  const pushMessage = useCoachingStore((s) => s.pushMessage)
  const cursor = useRef(0)

  const show = useCallback(
    (message: CoachMessageInput) => {
      // 떠 있는 카드를 먼저 치운다.
      // 화면에는 한 번에 하나만 뜨고(원칙 2) 그 하나는 **먼저 온 것**이 이긴다
      // (`selectVisibleMessage`). 앞 카드가 TTL 이 남은 동안 새 카드는 큐에서 기다리므로,
      // 치우지 않으면 발표자가 눌러도 화면이 그대로여서 고장으로 보인다.
      // `dismiss` 는 표시 큐에서만 빼므로 코치 레일의 기록은 그대로 쌓인다.
      const { messages, dismiss } = useCoachingStore.getState()
      messages.forEach((queued) => dismiss(queued.id))
      pushMessage(message)
    },
    [pushMessage],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== DEMO_COACHING_KEY) return
      // 입력 중에는 무시한다 — 서술형 칸에서 대괄호를 치면 코칭이 튀어나오면 안 된다.
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const next = DEMO_COACHING_SCRIPT[cursor.current]
      if (!next) return
      cursor.current += 1
      show(next)
    },
    [show],
  )

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onKeyDown])

  const showLlmSuggestion = useCallback(() => show(DEMO_LLM_SUGGESTION), [show])

  return { showLlmSuggestion: enabled ? showLlmSuggestion : null }
}
