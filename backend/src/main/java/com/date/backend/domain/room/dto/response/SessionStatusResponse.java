package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomSessionStatus;

import java.time.LocalDateTime;
import java.util.List;

public record SessionStatusResponse(
		Long sessionId,
		RoomSessionStatus status,
		LocalDateTime scheduledStartAt,
		LocalDateTime actualStartAt,
		long remainingSeconds,
		boolean allJoined,
		boolean allReady,
		boolean allConnected,
		List<SessionParticipantStateResponse> participants
) {
}
