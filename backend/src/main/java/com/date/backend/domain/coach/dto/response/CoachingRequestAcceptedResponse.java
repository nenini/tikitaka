package com.date.backend.domain.coach.dto.response;

/**
 * 질문 추천 요청이 받아들여졌다.
 *
 * <p>추천 문구는 이 응답이 아니라 기존 코칭 경로(STOMP 개인 큐)로 도착한다.
 * {@code requestId} 로 도착한 카드와 짝지어 버튼 로딩을 풀 수 있다.
 */
public record CoachingRequestAcceptedResponse(String requestId) {
}
