package com.date.backend.domain.result.dto;

import java.time.LocalDateTime;

public record PeerEvaluationSubmitResponse(
		Long evaluationId,
		Long sessionId,
		String status,
		boolean allSubmitted,
		boolean reportRequested,
		LocalDateTime submittedAt
) {
}
