package com.date.backend.domain.report.dto.response;

import java.util.List;

public record ReportAxisDetailResponse(
		Long reportId, String axisCode, ReportAxisResponse axis,
		List<ReportMetricItemResponse> relatedMetrics,
		List<ReportEvidenceResponse> evidenceSegments
) {}
