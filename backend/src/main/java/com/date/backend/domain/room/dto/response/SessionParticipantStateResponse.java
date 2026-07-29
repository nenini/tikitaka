package com.date.backend.domain.room.dto.response;

import java.time.LocalDateTime;

public record SessionParticipantStateResponse(
		Long userId,
		boolean joined,
		boolean ready,
		LocalDateTime joinedAt
) {
}
