package com.date.backend.domain.safety.dto;

import com.date.backend.domain.safety.domain.SafetySeverity;

public record SafetyEventReceiptResponse(
		String eventId,
		String status,
		SafetySeverity effectiveSeverity,
		int occurrenceCount,
		int mannerPenaltyScore
) {
}
