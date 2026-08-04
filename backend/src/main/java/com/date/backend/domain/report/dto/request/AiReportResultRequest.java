package com.date.backend.domain.report.dto.request;

import com.date.backend.domain.report.domain.AiReportResultStatus;
import com.date.backend.domain.report.domain.AiReportFailureCode;
import com.date.backend.domain.report.domain.ReportGenerationMode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.OffsetDateTime;
import java.util.List;

public record AiReportResultRequest(
		@Schema(description = "AI-BE 최종 리포트 계약 버전", example = "1")
		@Positive int schemaVersion,
		@Schema(example = "12345") @NotNull @Positive Long sessionId,
		@Schema(example = "analysis-v1.0.0")
		@NotBlank @Pattern(regexp = "analysis-v\\d+\\.\\d+\\.\\d+") String analysisVersion,
		@Schema(example = "report-v1.0.0")
		@NotBlank @Pattern(regexp = "report-v\\d+\\.\\d+\\.\\d+") String reportVersion,
		@NotNull OffsetDateTime generatedAt,
		@NotEmpty List<@Valid ParticipantReportResult> reports
) {
	public record ParticipantReportResult(
			@NotNull @Positive Long userId,
			@NotNull AiReportResultStatus reportStatus,
			@NotNull ReportGenerationMode generationMode,
			@Size(max = 5000) String summaryText,
			@NotNull @Size(max = 10) List<@NotBlank @Size(max = 1000) String> strengths,
			@NotNull @Size(max = 10) List<@NotBlank @Size(max = 1000) String> improvements,
			@NotNull @Size(max = 10) List<@NotBlank @Size(max = 1000) String> nextMissions,
			AiReportFailureCode failureCode,
			@Size(max = 1000) String failureReason
	) {}
}
