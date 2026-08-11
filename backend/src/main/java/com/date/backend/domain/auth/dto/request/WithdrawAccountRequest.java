package com.date.backend.domain.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

public record WithdrawAccountRequest(
		@NotBlank
		String password
) {
}
