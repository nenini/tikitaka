/**
 * 온보딩 설문(SURVEY · W-06 / `SURVEY-01`) 도메인 타입.
 * 백엔드 SSOT: `SurveyController` + `survey/dto/*`, 카탈로그 시드는
 * `V5__add_survey_schema_and_catalog.sql`.
 *
 *   GET  /api/v1/surveys/options     선택지(프로필 성별로 이미 필터돼서 온다)
 *   POST /api/v1/users/me/survey     최초 등록
 *   GET  /api/v1/users/me/survey     내 응답
 *   PUT  /api/v1/users/me/survey     전체 수정
 *
 * 확정 계약(2026-08-04, CONTRACT_DECISIONS.md A9):
 *   선호 얼굴상 **1개** · 원하는 상대 성격 **3개** · 본인 성격 **3개** ·
 *   선호 나이 최소~최대 · 개선 고민 **1개 이상**
 */

export type ApplicableGender = 'ALL' | 'MALE' | 'FEMALE'

export type GoalCategory = 'SPEECH_AMOUNT' | 'VOICE_VOLUME' | 'OTHER'

export interface SurveyFaceTag {
  id: number
  code: string
  name: string
  applicableGender: ApplicableGender
}

export interface SurveyTrait {
  id: number
  code: string
  name: string
}

export interface SurveyPracticeGoal {
  id: number
  code: string
  name: string
  category: GoalCategory
}

/**
 * GET /surveys/options.
 *
 * ⚠️ `faceTags` 는 **서버가 이미 프로필 성별로 걸러서** 준다
 * (`ApplicableGender.ALL` + 상대 성별). 프론트에서 다시 필터하지 않는다.
 * 프로필이 없으면 이 API 자체가 실패하므로, 온보딩 순서(프로필 → 얼굴 → 설문)가
 * 서버 쪽에서도 강제된다.
 */
export interface SurveyOptions {
  faceTags: SurveyFaceTag[]
  traits: SurveyTrait[]
  practiceGoals: SurveyPracticeGoal[]
}

/** POST·PUT /users/me/survey 본문(SurveySaveRequest). */
export interface SurveySavePayload {
  preferredFaceTagId: number
  preferredTraitIds: number[]
  userTraitIds: number[]
  minPreferredAge: number
  maxPreferredAge: number
  practiceGoalIds: number[]
}

/** GET·POST·PUT /users/me/survey 응답(SurveyResponse). */
export interface SurveyAnswer {
  userId: number
  preferredFaceTag: SurveyFaceTag
  preferredTraits: SurveyTrait[]
  userTraits: SurveyTrait[]
  minPreferredAge: number
  maxPreferredAge: number
  practiceGoals: SurveyPracticeGoal[]
}

/* ── 확정된 선택 개수 규칙 ─────────────────────────────── */

/**
 * 성격은 서버가 `@Size(min=3, max=3)` 으로 **정확히 3개**를 요구한다.
 * 개수를 채우기 전에는 제출을 잠가, 사용자가 서버 검증 오류를 보지 않게 한다.
 */
export const TRAIT_PICK_COUNT = 3

/** 개선 고민은 1개 이상이면 된다(상한 없음). */
export const GOAL_MIN_COUNT = 1

/**
 * 선호 나이 UI 범위.
 * ⚠️ 서버는 `@Positive` 와 `max >= min` 만 검증한다 — 아래 값은 **화면 규칙**이며
 *    기획 확정 전까지의 잠정치다(CONTRACT_DECISIONS.md A9 후속 작업).
 */
export const AGE_MIN = 19
export const AGE_MAX = 60
export const AGE_DEFAULT_MIN = 25
export const AGE_DEFAULT_MAX = 35
