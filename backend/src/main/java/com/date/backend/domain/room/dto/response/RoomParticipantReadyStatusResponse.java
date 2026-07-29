package com.date.backend.domain.room.dto.response;

public record RoomParticipantReadyStatusResponse(
		Long userId,
		String nickname,
		boolean ready
) {
}
