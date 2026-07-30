package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.SessionTimerEventType;
import com.date.backend.domain.room.dto.response.SessionTimerEventResponse;

import java.time.LocalDateTime;

public record SessionTimerBroadcastEvent(
		SessionTimerEventResponse payload
) {
	public static SessionTimerBroadcastEvent of(
			SessionTimerEventType eventType,
			Long sessionId,
			long remainingSeconds,
			LocalDateTime endsAt,
			LocalDateTime occurredAt
	) {
		return new SessionTimerBroadcastEvent(
				new SessionTimerEventResponse(
						eventType,
						sessionId,
						remainingSeconds,
						endsAt,
						occurredAt
				)
		);
	}
}
