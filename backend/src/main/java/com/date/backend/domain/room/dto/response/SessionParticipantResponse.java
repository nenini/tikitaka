package com.date.backend.domain.room.dto.response;

public record SessionParticipantResponse(
		Long userId,
		String nickname,
		String role,
		String status
) {
}
