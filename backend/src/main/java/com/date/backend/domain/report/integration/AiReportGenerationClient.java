package com.date.backend.domain.report.integration;

public interface AiReportGenerationClient {
	boolean configured();
	void request(AiReportGenerationRequest request);
}
