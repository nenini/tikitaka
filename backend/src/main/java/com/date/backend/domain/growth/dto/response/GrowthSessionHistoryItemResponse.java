package com.date.backend.domain.growth.dto.response;

import com.date.backend.domain.growth.domain.GrowthSessionStatus;
import java.time.LocalDateTime;

public record GrowthSessionHistoryItemResponse(
		Long sessionId,
		GrowthSessionStatus status,
		LocalDateTime scheduledStartAt,
		LocalDateTime startedAt,
		LocalDateTime endedAt,
		long durationSeconds,
		String partnerAlias,
		GrowthSessionReportResponse report
) {}
