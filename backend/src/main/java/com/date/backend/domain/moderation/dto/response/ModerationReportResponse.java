package com.date.backend.domain.moderation.dto.response;

import com.date.backend.domain.moderation.domain.ModerationReportReason;
import com.date.backend.domain.moderation.domain.ModerationReportStatus;
import com.date.backend.domain.room.domain.RoomSessionStatus;

import java.time.LocalDateTime;
import java.util.List;

public record ModerationReportResponse(
		Long reportId,
		Long sessionId,
		Long reporterUserId,
		Long reportedUserId,
		ModerationReportReason reasonCode,
		String details,
		ModerationReportStatus status,
		RoomSessionStatus sessionStatusSnapshot,
		LocalDateTime reportedAt,
		List<ReportEvidenceResponse> evidences
) {
}
