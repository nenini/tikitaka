package com.date.backend.domain.moderation.dto.response;

import java.util.List;

public record UserBlockListResponse(
		List<UserBlockResponse> blocks
) {
}
