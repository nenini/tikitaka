package com.date.backend.domain.report.dto.response;

public record AiReportResultAcceptedResponse(
		Long sessionId,
		String reportVersion,
		int acceptedCount,
		int duplicateCount
) {}
