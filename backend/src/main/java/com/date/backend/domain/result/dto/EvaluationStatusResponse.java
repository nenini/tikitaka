package com.date.backend.domain.result.dto;

public record EvaluationStatusResponse(
		Long sessionId,
		boolean mySubmitted,
		boolean partnerSubmitted,
		boolean allSubmitted
) {
}
