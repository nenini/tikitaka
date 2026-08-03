package com.date.backend.domain.moderation.dto.response;

import com.date.backend.domain.moderation.domain.ReportEvidenceType;

import java.time.LocalDateTime;

public record ReportEvidenceResponse(
		Long evidenceId,
		ReportEvidenceType evidenceType,
		String objectKey,
		String originalFileName,
		String contentType,
		long sizeBytes,
		LocalDateTime capturedAt
) {
}
