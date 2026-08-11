package com.date.backend.domain.report.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;

public record VoiceSessionAnalysisRequest(
		@Min(1) int schemaVersion,
		@NotBlank @Size(max = 128) String analysisVersion,
		@NotNull @Positive Long sessionId,
		@NotNull @Positive Long userId,
		@Positive long sessionDurationMs,
		@NotNull OffsetDateTime analyzedAt,
		@NotNull @Valid Metrics metrics
) {
	public record Metrics(
			@PositiveOrZero long speakingMs,
			@PositiveOrZero int utteranceCount,
			@PositiveOrZero BigDecimal meanUtteranceMs,
			@PositiveOrZero BigDecimal meanResponseMs,
			@PositiveOrZero int responseSampleCount,
			@PositiveOrZero int fillerCount,
			@NotNull Map<@NotBlank @Size(max = 50) String, @PositiveOrZero Integer> fillerBreakdown,
			@PositiveOrZero int aiTurnCount,
			@PositiveOrZero int unansweredTurnCount,
			@PositiveOrZero int bargeInCount
	) {}
}
