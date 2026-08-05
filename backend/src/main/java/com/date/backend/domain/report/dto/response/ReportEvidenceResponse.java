package com.date.backend.domain.report.dto.response;

import com.date.backend.domain.report.domain.AnalysisEvidenceType;

public record ReportEvidenceResponse(
		String evidenceId,
		AnalysisEvidenceType eventType,
		long startMs,
		long endMs,
		String description
) {}
