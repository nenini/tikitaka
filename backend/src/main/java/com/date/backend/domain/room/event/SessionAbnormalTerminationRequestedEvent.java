package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.SessionTerminationReason;

import java.time.LocalDateTime;

public record SessionAbnormalTerminationRequestedEvent(
		Long sessionId,
		Long disconnectedUserId,
		SessionTerminationReason reason,
		LocalDateTime requestedAt
) {
}
