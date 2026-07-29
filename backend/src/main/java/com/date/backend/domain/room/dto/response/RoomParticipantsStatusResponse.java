package com.date.backend.domain.room.dto.response;

import java.util.List;

public record RoomParticipantsStatusResponse(
		Long roomId,
		boolean allReady,
		List<RoomParticipantReadyStatusResponse> participants
) {
}
