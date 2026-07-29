package com.date.backend.domain.room.dto.response;

public record RoomParticipantSummaryResponse(
		Long userId,
		String nickname,
		String participationStatus
) {
}
