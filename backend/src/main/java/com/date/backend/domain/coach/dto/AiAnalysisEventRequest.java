package com.date.backend.domain.coach.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;

public record AiAnalysisEventRequest(
		@NotBlank String eventId,
		@Positive int version,
		@NotBlank String eventType,
		@NotBlank String source,
		@NotBlank String sessionId,
		@NotBlank String userId,
		String participantIdentity,
		String clientInstanceId,
		@PositiveOrZero Long seq,
		@PositiveOrZero long sessionElapsedMs,
		@DecimalMin("0.0") @DecimalMax("1.0") BigDecimal confidence,
		@NotNull OffsetDateTime occurredAt,
		@Size(max = 128) String modelVersion,
		@Size(max = 128) String ruleVersion,
		@NotNull Map<String, Object> payload
) {
}
