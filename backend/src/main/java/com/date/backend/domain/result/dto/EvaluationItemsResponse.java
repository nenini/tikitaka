package com.date.backend.domain.result.dto;

import java.util.List;

public record EvaluationItemsResponse(
		Long sessionId,
		Long partnerUserId,
		List<EvaluationItemResponse> items,
		int maxTextLength
) {
}
