package com.date.backend.domain.growth.dto.response;

import java.util.List;

public record GrowthSessionHistoryResponse(
		List<GrowthSessionHistoryItemResponse> sessions,
		Long nextCursor,
		boolean hasNext
) {}
