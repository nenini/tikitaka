package com.date.backend.domain.coach.dto;

public record AiCoachingReceiptResponse(
		String eventId,
		String status
) {
	public static AiCoachingReceiptResponse of(String eventId, String status) {
		return new AiCoachingReceiptResponse(eventId, status);
	}
}
