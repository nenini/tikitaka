package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.SessionTerminationReason;

import java.time.Instant;

public record AiSessionEndedEvent(
		String eventType,
		int version,
		String sessionId,
		Instant endedAt,
		AiSessionEndReason reason
) {
	public static final String EVENT_TYPE = "AI_SESSION_ENDED";
	public static final int VERSION = 1;

	public static AiSessionEndedEvent of(
			Long sessionId,
			Instant endedAt,
			SessionTerminationReason terminationReason
	) {
		return new AiSessionEndedEvent(
				EVENT_TYPE,
				VERSION,
				String.valueOf(sessionId),
				endedAt,
				AiSessionEndReason.from(terminationReason)
		);
	}

	public enum AiSessionEndReason {
		NORMAL,
		TIMEOUT,
		PARTICIPANT_LEFT,
		ROOM_CLOSED,
		ERROR;

		private static AiSessionEndReason from(
				SessionTerminationReason reason
		) {
			return switch (reason) {
				case NORMAL_COMPLETION -> NORMAL;
				case USER_REQUEST -> PARTICIPANT_LEFT;
				case SAFETY_CONCERN, OTHER -> ROOM_CLOSED;
				case TECHNICAL_ISSUE -> ERROR;
				case TIME_EXPIRED -> TIMEOUT;
				case RECONNECT_TIMEOUT -> PARTICIPANT_LEFT;
			};
		}
	}
}
