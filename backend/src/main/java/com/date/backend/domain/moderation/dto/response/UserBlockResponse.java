package com.date.backend.domain.moderation.dto.response;

import java.time.LocalDateTime;

public record UserBlockResponse(
		Long userBlockId,
		Long blockedUserId,
		String reason,
		LocalDateTime blockedAt,
		boolean alreadyBlocked
) {
}
