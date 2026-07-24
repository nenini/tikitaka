package com.date.backend.domain.consent.dto.request;

import jakarta.validation.constraints.NotNull;

public record ConsentDecisionRequest(
		@NotNull(message = "동의 항목 ID는 필수입니다.")
		Long consentTypeId,

		@NotNull(message = "동의 여부는 필수입니다.")
		Boolean consented
) {
}
