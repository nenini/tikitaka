package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.SessionConnectionStatus;

import java.time.LocalDateTime;

public record SessionParticipantConnectionChangedResponse(
		String eventType,
		Long sessionId,
		Long userId,
		SessionConnectionStatus connectionStatus,
		LocalDateTime connectedAt,
		LocalDateTime disconnectedAt,
		LocalDateTime reconnectingAt,
		LocalDateTime reconnectDeadlineAt,
		LocalDateTime reconnectedAt,
		int reconnectAttemptCount,
		LocalDateTime occurredAt
) {
}
