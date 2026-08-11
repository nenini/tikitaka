package com.date.backend.domain.coach.integration;

import com.date.backend.domain.room.event.AiSessionEndedEvent;
import com.date.backend.domain.room.event.AiSessionStartedEvent;

public interface AiSessionEventClient {
	boolean configured();

	void send(AiSessionStartedEvent event);

	void send(AiSessionEndedEvent event);

	/**
	 * 사용자가 버튼으로 요청한 질문 추천.
	 *
	 * <p>세션 이벤트와 달리 요청/응답이다 — AI 가 문구를 만든 뒤에 응답하므로
	 * 최대 수 초가 걸린다. 같은 호스트·토큰을 쓰므로 이 클라이언트에 둔다.
	 */
	QuestionSuggestionResult requestQuestionSuggestion(
			Long sessionId,
			Long userId,
			String requestId
	);
}
