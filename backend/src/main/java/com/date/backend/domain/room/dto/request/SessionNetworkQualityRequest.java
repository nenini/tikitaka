package com.date.backend.domain.room.dto.request;

import com.date.backend.domain.room.domain.SessionNetworkQuality;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SessionNetworkQualityRequest(
		@NotBlank
		@Size(max = 100)
		String clientInstanceId,

		@NotBlank
		@Size(max = 255)
		String participantSid,

		@NotNull
		SessionNetworkQuality networkQuality
) {
}
