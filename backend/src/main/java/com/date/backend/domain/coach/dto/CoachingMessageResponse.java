package com.date.backend.domain.coach.dto;

import com.date.backend.domain.coach.domain.CoachingPriority;
import com.date.backend.domain.coach.domain.CoachingType;

public record CoachingMessageResponse(
		String eventType,
		String eventId,
		Long sessionId,
		CoachingType coachingType,
		String messageKey,
		String messageText,
		CoachingPriority priority,
		String reasonCode,
		long triggeredAtSessionElapsedMs,
		long expiresAtSessionElapsedMs
) {
	public static final String EVENT_TYPE = "COACHING_MESSAGE";
}
