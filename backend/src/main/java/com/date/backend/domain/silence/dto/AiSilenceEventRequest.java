package com.date.backend.domain.silence.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.OffsetDateTime;

public record AiSilenceEventRequest(
		@NotBlank String eventType,
		@Positive int version,
		@NotBlank String eventId,
		@NotBlank String source,
		@NotBlank String sessionId,
		@PositiveOrZero long silenceStartedAtSessionElapsedMs,
		@PositiveOrZero long detectedAtSessionElapsedMs,
		@PositiveOrZero long silenceDurationMs,
		@NotNull OffsetDateTime occurredAt
) {
}
