package com.date.backend.domain.profile.dto.request;

import com.date.backend.domain.profile.domain.Gender;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProfileCreateRequest(
		@NotBlank
		@Size(min = 2, max = 30)
		String nickname,

		@NotNull
		Gender gender,

		@NotBlank
		@Size(max = 50)
		String regionCity
) {
}
