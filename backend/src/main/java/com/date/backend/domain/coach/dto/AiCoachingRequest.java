package com.date.backend.domain.coach.dto;

import com.date.backend.domain.coach.domain.CoachingPriority;
import com.date.backend.domain.coach.domain.CoachingType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.OffsetDateTime;

public record AiCoachingRequest(
		@NotBlank String eventType,
		@Positive int version,
		@NotBlank String eventId,
		@NotNull OffsetDateTime occurredAt,
		@NotBlank String source,
		@NotBlank String sessionId,
		@NotBlank String targetUserId,
		@NotNull CoachingType coachingType,
		@NotBlank String messageKey,
		String messageText,
		@NotNull CoachingPriority priority,
		@NotBlank String reasonCode,
		@PositiveOrZero long triggeredAtSessionElapsedMs,
		@PositiveOrZero long expiresAtSessionElapsedMs,
		@NotBlank String deduplicationKey
) {
}
