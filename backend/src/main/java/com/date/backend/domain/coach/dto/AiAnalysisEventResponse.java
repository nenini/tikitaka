package com.date.backend.domain.coach.dto;

public record AiAnalysisEventResponse(
		String eventId,
		String status
) {
	public static AiAnalysisEventResponse stored(String eventId) {
		return new AiAnalysisEventResponse(eventId, "STORED");
	}

	public static AiAnalysisEventResponse duplicate(String eventId) {
		return new AiAnalysisEventResponse(eventId, "DUPLICATE");
	}
}
