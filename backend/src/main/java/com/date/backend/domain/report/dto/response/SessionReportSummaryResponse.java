package com.date.backend.domain.report.dto.response;

import com.date.backend.domain.report.domain.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record SessionReportSummaryResponse(
		Long reportId,
		Long sessionId,
		Long userId,
		SessionReportStatus status,
		ReportGenerationMode generationMode,
		Map<String, ReportAxisResponse> axes,
		String summaryText,
		List<String> strengths,
		List<String> improvements,
		String failureCode,
		String failureReason,
		LocalDateTime requestedAt,
		LocalDateTime generatedAt,
		LocalDateTime updatedAt
) {}
