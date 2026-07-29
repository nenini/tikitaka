package com.date.backend.domain.result.dto;

import com.date.backend.domain.result.domain.EvaluationItem;

public record EvaluationItemResponse(
		String key,
		String label,
		int minScore,
		int maxScore
) {
	public static EvaluationItemResponse from(EvaluationItem item) {
		return new EvaluationItemResponse(item.key(), item.label(), 1, 5);
	}
}
