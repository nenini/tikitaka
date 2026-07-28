package com.date.backend.domain.match.dto.request;

import jakarta.validation.constraints.Size;

public record MatchCancellationRequest(
		@Size(max = 500, message = "취소 사유는 500자 이하여야 합니다.")
		String reason
) {
}
