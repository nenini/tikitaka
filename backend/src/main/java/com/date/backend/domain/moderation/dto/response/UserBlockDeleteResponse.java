package com.date.backend.domain.moderation.dto.response;

public record UserBlockDeleteResponse(
		Long blockedUserId,
		boolean unblocked
) {
}
