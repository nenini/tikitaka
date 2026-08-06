package com.date.backend.domain.report.dto.request;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public record VoiceSessionReportRequest(
		@Min(1) int schemaVersion,
		@NotBlank @Size(max = 128) String analysisVersion,
		@NotBlank @Size(max = 128) String reportVersion,
		@NotNull @Positive Long sessionId,
		@NotNull @Positive Long userId,
		@NotNull OffsetDateTime generatedAt,
		@NotBlank String reportStatus,
		@NotBlank String generationMode,
		@Size(max = 1000) String headline,
		@NotNull @Size(max = 3) List<@NotBlank @Size(max = 1000) String> notes,
		@Size(max = 1000) String nextMission
) {}
