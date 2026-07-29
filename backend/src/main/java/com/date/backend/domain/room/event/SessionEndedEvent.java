package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.dto.response.SessionEndedResponse;

import java.time.LocalDateTime;

public record SessionEndedEvent(
		SessionEndedResponse payload
) {
	public static SessionEndedEvent of(
			Long sessionId,
			RoomSessionStatus status,
			SessionTerminationReason reason,
			LocalDateTime endedAt
	) {
		return new SessionEndedEvent(
				new SessionEndedResponse(
						SessionEndedResponse.SESSION_ENDED,
						sessionId,
						status,
						reason,
						endedAt
				)
		);
	}
}
