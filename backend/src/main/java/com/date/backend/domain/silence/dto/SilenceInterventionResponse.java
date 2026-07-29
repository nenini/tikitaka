package com.date.backend.domain.silence.dto;

import com.date.backend.domain.silence.domain.SilenceInterventionStage;

import java.util.List;

public record SilenceInterventionResponse(
		String eventType,
		String eventId,
		Long sessionId,
		long silenceDurationMs,
		SilenceInterventionStage interventionStage,
		List<QuestionCardResponse> questions
) {
	public static final String EVENT_TYPE = "SILENCE_INTERVENTION";
}
