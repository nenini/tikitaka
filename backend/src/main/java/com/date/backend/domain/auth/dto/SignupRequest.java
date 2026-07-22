package com.date.backend.domain.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record SignupRequest(
		@NotBlank
		@Email
		String email,

		@NotBlank
		@Size(min = 8, max = 64)
		@Pattern(regexp = com.date.backend.domain.auth.password.PasswordPolicy.REGEXP,
				message = com.date.backend.domain.auth.password.PasswordPolicy.MESSAGE)
		String password,

		@NotBlank
		@Size(max = 50)
		String realName,

		@Size(max = 30)
		String phoneNumber,

		@NotNull
		@Past
		LocalDate birthDate
) {
}
