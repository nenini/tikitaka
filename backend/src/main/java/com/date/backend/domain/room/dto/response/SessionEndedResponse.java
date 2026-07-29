package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;

import java.time.LocalDateTime;

public record SessionEndedResponse(
		String eventType,
		Long sessionId,
		RoomSessionStatus status,
		SessionTerminationReason reason,
		LocalDateTime endedAt
) {
	public static final String SESSION_ENDED = "SESSION_ENDED";
}
