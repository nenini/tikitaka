package com.date.backend.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record LogoutRequest(
		@NotBlank
		String refreshToken
) {
}
