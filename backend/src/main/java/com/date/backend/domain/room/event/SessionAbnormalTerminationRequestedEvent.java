package com.date.backend.domain.room.event;

import java.time.LocalDateTime;

public record SessionAbnormalTerminationRequestedEvent(
		Long sessionId,
		Long disconnectedUserId,
		String reason,
		LocalDateTime requestedAt
) {
	public static final String RECONNECT_TIMEOUT = "RECONNECT_TIMEOUT";
}
