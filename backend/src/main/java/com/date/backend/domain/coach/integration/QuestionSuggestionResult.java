package com.date.backend.domain.coach.integration;

/**
 * 질문 추천 요청에 대한 AI 응답.
 *
 * <p>AI 는 문구 생성까지 마친 뒤 응답한다. 만들지 못한 것을 성공으로 돌려주면
 * 화면이 오지 않을 코칭 카드를 기다리게 되므로, 실패를 별도 값으로 구분한다.
 */
public enum QuestionSuggestionResult {
	/** 문구를 만들었다. 코칭은 곧 STOMP 로 전달된다 */
	CREATED,
	/** 전사가 아직 없거나 생성에 실패했다 */
	UNAVAILABLE,
	/** AI 가 이 세션을 들고 있지 않다 */
	SESSION_NOT_ACTIVE,
	/** AI 연동이 설정되지 않았다 */
	NOT_CONFIGURED
}
