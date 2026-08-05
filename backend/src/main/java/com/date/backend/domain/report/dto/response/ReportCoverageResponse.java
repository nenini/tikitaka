package com.date.backend.domain.report.dto.response;

import java.math.BigDecimal;

public record ReportCoverageResponse(
		BigDecimal faceDetectionRate,
		BigDecimal speechRecognitionRate,
		BigDecimal cameraUptimeRate
) {}
