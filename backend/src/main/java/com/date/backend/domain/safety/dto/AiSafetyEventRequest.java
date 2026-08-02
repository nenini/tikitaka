package com.date.backend.domain.safety.dto;

import com.date.backend.domain.safety.domain.SafetyCategory;
import com.date.backend.domain.safety.domain.SafetySeverity;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record AiSafetyEventRequest(
		@NotBlank String eventType,
		@Positive int version,
		@NotBlank String eventId,
		@NotBlank String source,
		@NotBlank String sessionId,
		@NotBlank String userId,
		@NotNull SafetyCategory category,
		@NotNull SafetySeverity severity,
		@NotBlank String reasonCode,
		@NotBlank String warningMessage,
		@DecimalMin("0.0") @DecimalMax("1.0") BigDecimal confidence,
		@NotBlank String deduplicationKey,
		@PositiveOrZero long sessionElapsedMs,
		@NotNull OffsetDateTime occurredAt
) {
}
