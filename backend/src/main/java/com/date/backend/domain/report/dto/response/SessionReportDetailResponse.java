package com.date.backend.domain.report.dto.response;

import com.date.backend.domain.report.domain.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record SessionReportDetailResponse(
		Long reportId,
		Long sessionId,
		Long userId,
		SessionReportStatus status,
		ReportGenerationMode generationMode,
		String analysisVersion,
		String reportVersion,
		Map<String, ReportAxisResponse> axes,
		ReportMetricsResponse metrics,
		String summaryText,
		List<String> strengths,
		List<String> improvements,
		List<String> nextMissions,
		List<ReportEvidenceResponse> evidenceSegments,
		String failureCode,
		String failureReason,
		int attemptCount,
		LocalDateTime requestedAt,
		LocalDateTime generationStartedAt,
		LocalDateTime generatedAt,
		LocalDateTime updatedAt
) {}
