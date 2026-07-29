package com.date.backend.domain.silence.dto;

import java.util.List;

public record ContextualQuestionRecommendationResponse(
		String eventType,
		String eventId,
		Long sessionId,
		List<String> questions,
		long expiresAtSessionElapsedMs
) {
	public static final String EVENT_TYPE = "CONTEXTUAL_QUESTION_RECOMMENDATION";
}
