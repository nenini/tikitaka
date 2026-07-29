package com.date.backend.domain.silence.dto;

import com.date.backend.domain.silence.domain.SilenceInterventionStage;

public record SilenceEventReceiptResponse(
		String eventId,
		String status,
		SilenceInterventionStage interventionStage
) {
}
