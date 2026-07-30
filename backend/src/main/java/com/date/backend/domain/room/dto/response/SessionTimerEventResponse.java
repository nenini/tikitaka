package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.SessionTimerEventType;

import java.time.LocalDateTime;

public record SessionTimerEventResponse(
		SessionTimerEventType eventType,
		Long sessionId,
		long remainingSeconds,
		LocalDateTime endsAt,
		LocalDateTime occurredAt
) {
}
