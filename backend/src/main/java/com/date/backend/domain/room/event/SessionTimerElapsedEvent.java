package com.date.backend.domain.room.event;

import java.time.LocalDateTime;

public record SessionTimerElapsedEvent(
		Long sessionId,
		LocalDateTime elapsedAt
) {
}
