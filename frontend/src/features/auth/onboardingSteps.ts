/**
 * 온보딩 단계 표시(`Steps`)의 단일 정의.
 *
 * 예전에는 각 화면이 `STEP_LABELS` 를 따로 들고 있었다. 단계가 하나 늘어날 때
 * 네 파일을 같이 고쳐야 해서, 한 곳이라도 빠지면 화면마다 진행 표시가 어긋난다.
 */
export const ONBOARDING_STEP_LABELS = [
  '계정',
  '본인인증',
  '동의',
  '프로필',
  '얼굴',
  '설문',
] as const

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEP_LABELS.length

/** 1-based 단계 번호. `Steps` 의 `current` 에 그대로 넣는다. */
export const ONBOARDING_STEP = {
  account: 1,
  verify: 2,
  consent: 3,
  profile: 4,
  face: 5,
  survey: 6,
} as const
