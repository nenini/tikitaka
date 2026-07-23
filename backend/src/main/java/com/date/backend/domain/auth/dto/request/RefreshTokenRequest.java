package com.date.backend.domain.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

public record RefreshTokenRequest(
		@NotBlank
		String refreshToken
) {
}
