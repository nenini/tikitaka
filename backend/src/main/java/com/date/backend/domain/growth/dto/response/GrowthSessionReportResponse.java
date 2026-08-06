package com.date.backend.domain.growth.dto.response;

public record GrowthSessionReportResponse(
		boolean exists,
		Long reportId,
		String status
) {}
