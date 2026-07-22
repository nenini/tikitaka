package com.date.backend.domain.auth.dto;

import com.date.backend.domain.auth.password.PasswordPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PasswordResetConfirmRequest(
		@NotBlank
		String token,

		@NotBlank
		@Size(min = 8, max = 64)
		@Pattern(regexp = PasswordPolicy.REGEXP, message = PasswordPolicy.MESSAGE)
		String newPassword
) {
}
