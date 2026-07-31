package com.date.backend.domain.auth.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
		@NotBlank
		@Email
		@Schema(example = "match.woman@example.com")
		String email,

		@NotBlank
		@Schema(example = "qwer1234@")
		String password
) {
}
