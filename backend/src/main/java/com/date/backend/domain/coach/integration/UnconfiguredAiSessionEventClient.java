package com.date.backend.domain.coach.integration;

import com.date.backend.domain.room.event.AiSessionEndedEvent;
import com.date.backend.domain.room.event.AiSessionStartedEvent;

public class UnconfiguredAiSessionEventClient
		implements AiSessionEventClient {
	@Override
	public boolean configured() {
		return false;
	}

	@Override
	public void send(AiSessionStartedEvent event) {
		// The integration is optional in local and test environments.
	}

	@Override
	public void send(AiSessionEndedEvent event) {
		// The integration is optional in local and test environments.
	}

	@Override
	public QuestionSuggestionResult requestQuestionSuggestion(
			Long sessionId,
			Long userId,
			String requestId
	) {
		return QuestionSuggestionResult.NOT_CONFIGURED;
	}
}
