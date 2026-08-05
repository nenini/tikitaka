package com.date.backend.domain.report.integration;

public class UnconfiguredAiReportGenerationClient implements AiReportGenerationClient {
	@Override public boolean configured() { return false; }
	@Override public void request(AiReportGenerationRequest request) {
		throw new IllegalStateException("AI report generation client is not configured.");
	}
}
