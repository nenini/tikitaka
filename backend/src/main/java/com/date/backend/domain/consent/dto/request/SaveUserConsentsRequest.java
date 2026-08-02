package com.date.backend.domain.consent.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record SaveUserConsentsRequest(
		@NotEmpty(message = "저장할 동의 항목을 한 개 이상 입력해 주세요.")
		List<@Valid ConsentDecisionRequest> consents
) {
}
