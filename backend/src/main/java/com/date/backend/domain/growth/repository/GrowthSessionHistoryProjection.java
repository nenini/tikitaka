package com.date.backend.domain.growth.repository;

import java.time.LocalDateTime;

public interface GrowthSessionHistoryProjection {
	Long getSessionId();
	String getSessionStatus();
	LocalDateTime getScheduledStartAt();
	LocalDateTime getActualStartAt();
	LocalDateTime getActualEndAt();
	Long getReportId();
	String getReportStatus();
}
