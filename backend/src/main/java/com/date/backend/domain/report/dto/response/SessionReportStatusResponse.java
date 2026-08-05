package com.date.backend.domain.report.dto.response;

import com.date.backend.domain.report.domain.SessionReportStatus;
import java.time.LocalDateTime;

public record SessionReportStatusResponse(
		Long reportId, Long sessionId, SessionReportStatus status,
		String failureCode, String failureReason,
		LocalDateTime requestedAt, LocalDateTime generatedAt, LocalDateTime updatedAt
) {}
