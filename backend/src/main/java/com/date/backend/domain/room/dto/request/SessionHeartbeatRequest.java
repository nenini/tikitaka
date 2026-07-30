package com.date.backend.domain.room.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SessionHeartbeatRequest(
		@NotBlank
		@Size(max = 100)
		String clientInstanceId,

		@NotBlank
		@Size(max = 255)
		String participantSid
) {
}
