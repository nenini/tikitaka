package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.dto.response.SessionParticipantConnectionChangedResponse;

import java.time.LocalDateTime;

public record SessionParticipantConnectionChangedEvent(
		SessionParticipantConnectionChangedResponse payload
) {
	public static SessionParticipantConnectionChangedEvent of(
			String eventType,
			RoomParticipant participant,
			LocalDateTime occurredAt
	) {
		return new SessionParticipantConnectionChangedEvent(
				new SessionParticipantConnectionChangedResponse(
						eventType,
						participant.getRoomId(),
						participant.getUserId(),
						participant.getConnectionStatus(),
						participant.getConnectedAt(),
						participant.getDisconnectedAt(),
						participant.getReconnectingAt(),
						participant.getReconnectDeadlineAt(),
						participant.getReconnectedAt(),
						participant.getReconnectAttemptCount(),
						occurredAt
				)
		);
	}
}
