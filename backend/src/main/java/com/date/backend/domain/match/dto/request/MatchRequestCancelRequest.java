package com.date.backend.domain.match.dto.request;

import jakarta.validation.constraints.Size;

public record MatchRequestCancelRequest(
		@Size(max = 500)
		String reason
) {
}
