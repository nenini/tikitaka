package com.date.backend.domain.moderation.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;

public record UserBlockCreateRequest(
		@Size(max = 500)
		@Schema(description = "차단 사유", maxLength = 500)
		String reason
) {
}
