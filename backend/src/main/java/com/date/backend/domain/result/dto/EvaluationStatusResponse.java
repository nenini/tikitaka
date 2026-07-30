package com.date.backend.domain.result.dto;

import java.time.LocalDateTime;

public record EvaluationStatusResponse(
		Long sessionId,
		boolean mySubmitted,
		boolean partnerSubmitted,
		boolean allSubmitted,
		LocalDateTime deadlineAt,
		long remainingSeconds,
		boolean submissionOpen,
		boolean resultAvailable,
		boolean resultPermanentlyLocked
) {
}
