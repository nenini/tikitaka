package com.date.backend.domain.silence.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;

public record AiQuestionRecommendationRequest(
		@NotBlank String eventType,
		@Positive int version,
		@NotBlank String eventId,
		@NotBlank String source,
		@NotBlank String sessionId,
		@NotBlank String targetUserId,
		@PositiveOrZero long triggeredAtSessionElapsedMs,
		@PositiveOrZero long expiresAtSessionElapsedMs,
		@NotBlank String deduplicationKey,
		String contextSummary,
		@NotNull @Size(min = 3, max = 3) List<@NotBlank String> questions,
		@NotNull OffsetDateTime occurredAt
) {
}
