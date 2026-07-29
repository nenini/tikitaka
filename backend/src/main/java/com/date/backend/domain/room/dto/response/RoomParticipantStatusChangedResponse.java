package com.date.backend.domain.room.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record RoomParticipantStatusChangedResponse(
		String eventType,
		Long roomId,
		Long changedUserId,
		boolean ready,
		boolean allReady,
		List<RoomParticipantReadyStatusResponse> participants,
		LocalDateTime occurredAt
) {
}
