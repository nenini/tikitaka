package com.date.backend.domain.room.dto.request;

import jakarta.validation.constraints.NotNull;

public record SessionAnalysisSettingsRequest(
		@NotNull Boolean voiceAnalysisEnabled,
		@NotNull Boolean expressionAnalysisEnabled
) {
}
