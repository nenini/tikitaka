package com.date.backend.domain.report.integration;

import java.time.OffsetDateTime;

public record AiReportGenerationRequest(
		int schemaVersion,
		Long sessionId,
		OffsetDateTime requestedAt
) {
	public static AiReportGenerationRequest of(Long sessionId, OffsetDateTime requestedAt) {
		return new AiReportGenerationRequest(1, sessionId, requestedAt);
	}
}
