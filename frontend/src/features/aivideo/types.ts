/**
 * AI 화상 연습(W-21) 도메인 타입.
 *
 * ⚠️ **지금은 서버 세션이 없다.** 백엔드에 AI 화상 세션을 만드는 엔드포인트가 없고
 *    (`WaitingRoom` 의 AI_VIDEO 생성자는 호출부가 없다), 대화를 이끌 음성 오케스트레이터
 *    (`ai/voice`)도 없다. 그래서 이 화면은 **혼자 연습 모드**로 동작한다 —
 *    브라우저 안에서 카메라를 켜고, 주제 질문을 띄우고, 표정을 로컬 분석한다.
 *
 *    결과가 서버로 가지 않으므로 **리포트도 사랑의 온도 반영도 없다.** 화면에서
 *    그렇게 안내한다. 서버가 생기면 시작 버튼만 세션 생성으로 바꾸고 분석은
 *    `useVisionAnalysis`(전송본)로 갈아끼우면 된다.
 *
 * 주제 코드는 백엔드 `WaitingRoom.requireAiVideoScenario` 가 받는 값과 **같게 둔다** —
 * 나중에 서버에 붙일 때 매핑 표를 새로 만들지 않기 위해서다.
 */

/** 백엔드가 허용하는 AI 화상 주제(`first_meet` … `travel`). */
export const AI_VIDEO_SCENARIOS = ['first_meet', 'hobby', 'work', 'food', 'travel'] as const

export type AiVideoScenario = (typeof AI_VIDEO_SCENARIOS)[number]

export interface ScenarioMeta {
  readonly label: string
  readonly emoji: string
  /** 카드에 한 줄로 붙는 설명 */
  readonly description: string
  /**
   * 연습 중 순서대로 넘어가는 질문.
   *
   * 상대가 없으므로 **화면이 상대 역할을 한다.** 질문을 소리 내어 답하는 것이
   * 이 연습의 전부다 — 그래서 "무엇을 말할지" 를 화면이 계속 대신 정해 준다.
   */
  readonly questions: readonly string[]
}

export const SCENARIO_META: Record<AiVideoScenario, ScenarioMeta> = {
  first_meet: {
    label: '첫 만남',
    emoji: '👋',
    description: '처음 만난 사람과 어색함을 푸는 대화',
    questions: [
      '안녕하세요, 오늘 여기까지 어떻게 오셨어요?',
      '평소 주말에는 주로 뭐 하면서 보내세요?',
      '요즘 가장 자주 하는 생각이 뭐예요?',
      '어떤 사람이랑 있을 때 제일 편하세요?',
      '오늘 이야기 나눠보니 어떠셨어요?',
    ],
  },
  hobby: {
    label: '취미',
    emoji: '🎨',
    description: '좋아하는 것을 즐겁게 소개하기',
    questions: [
      '요즘 푹 빠져 있는 게 있으세요?',
      '그건 어떻게 시작하게 되셨어요?',
      '해보고 나서 달라진 점이 있다면요?',
      '같이 해보고 싶은 사람이 있다면 어떤 사람일까요?',
      '앞으로 새로 배워보고 싶은 건 뭐예요?',
    ],
  },
  work: {
    label: '일',
    emoji: '💼',
    description: '하는 일을 자랑하지 않고 설명하기',
    questions: [
      '어떤 일 하시는지 여쭤봐도 될까요?',
      '그 일에서 제일 재미있는 순간은 언제예요?',
      '반대로 힘든 건 어떤 부분이에요?',
      '일 끝나고 나면 주로 뭐 하세요?',
      '앞으로 어떤 모습이고 싶으세요?',
    ],
  },
  food: {
    label: '음식',
    emoji: '🍜',
    description: '가볍게 이어가기 좋은 주제',
    questions: [
      '평소에 어떤 음식 좋아하세요?',
      '최근에 갔던 곳 중에 기억에 남는 데 있어요?',
      '직접 요리하는 것도 좋아하세요?',
      '못 먹거나 피하는 음식이 있으세요?',
      '다음에 같이 가보고 싶은 데가 있다면요?',
    ],
  },
  travel: {
    label: '여행',
    emoji: '✈️',
    description: '이야기가 길게 이어지는 주제',
    questions: [
      '여행 다니는 거 좋아하세요?',
      '가장 기억에 남는 여행지는 어디예요?',
      '여행 갈 때 계획을 세우는 편이세요?',
      '혼자 가는 것과 같이 가는 것 중에는요?',
      '다음에 가보고 싶은 곳이 있으세요?',
    ],
  },
}

/** 연습 길이. 백엔드 `WaitingRoom.AI_VIDEO_DURATION_SECONDS` 와 같은 5분. */
export const PRACTICE_DURATION_SEC = 5 * 60

/** 질문 하나에 머무는 시간. 5개 질문이 5분을 고르게 나눈다. */
export const QUESTION_INTERVAL_SEC = 60

/**
 * 연습이 끝나고 보여줄 로컬 요약.
 *
 * ⚠️ **점수를 매기지 않는다.** 리포트 화법 규칙(§7.4)과 같다 — 사실과 횟수만 남기고
 *    등수·등급은 만들지 않는다. 서버 분석 없이 매긴 점수는 근거가 더 약하다.
 */
export interface PracticeSummary {
  /** 실제로 연습한 시간(초). 중간에 끝내면 5분보다 짧다 */
  readonly practicedSec: number
  /** 다룬 질문 수 */
  readonly questionsCovered: number
  /** 미소 구간 횟수 */
  readonly smileCount: number
  /** 미소를 유지한 총 시간(ms) */
  readonly smileMs: number
  /** 끄덕임 횟수 */
  readonly nodCount: number
  /** 화면 밖으로 시선이 오래 머문 횟수 */
  readonly gazeAwayCount: number
  /** 얼굴이 잡히지 않아 분석이 비었던 구간 수 */
  readonly faceMissingCount: number
  /** 분석이 아예 돌지 못했는가(모델 로드 실패 등) */
  readonly analysisUnavailable: boolean
}

/** "3분 20초". 0 이면 '0초'. */
export function formatDurationKo(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}초`
  if (s === 0) return `${m}분`
  return `${m}분 ${s}초`
}
