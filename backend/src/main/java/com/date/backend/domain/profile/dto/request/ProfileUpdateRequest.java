package com.date.backend.domain.profile.dto.request;

import com.date.backend.domain.profile.domain.Gender;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ProfileUpdateRequest(
		@Size(min = 2, max = 30)
		@Pattern(regexp = "(?s).*\\S.*", message = "공백만 입력할 수 없습니다.")
		String nickname,

		Gender gender,

		@Size(max = 50)
		@Pattern(regexp = "(?s).*\\S.*", message = "공백만 입력할 수 없습니다.")
		String regionCity
) {
	public boolean hasNoChanges() {
		return nickname == null && gender == null && regionCity == null;
	}
}
