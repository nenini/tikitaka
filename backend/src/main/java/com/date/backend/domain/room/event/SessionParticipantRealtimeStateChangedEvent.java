package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.dto.response.SessionParticipantRealtimeStateChangedResponse;

import java.time.LocalDateTime;

public record SessionParticipantRealtimeStateChangedEvent(
		SessionParticipantRealtimeStateChangedResponse payload
) {
	public static SessionParticipantRealtimeStateChangedEvent of(
			String eventType,
			RoomParticipant participant,
			LocalDateTime occurredAt
	) {
		return new SessionParticipantRealtimeStateChangedEvent(
				new SessionParticipantRealtimeStateChangedResponse(
						eventType,
						participant.getRoomId(),
						participant.getUserId(),
						participant.isCameraEnabled(),
						participant.isMicrophoneEnabled(),
						participant.getNetworkQuality(),
						participant.getMediaStateUpdatedAt(),
						participant.getNetworkQualityUpdatedAt(),
						occurredAt
				)
		);
	}
}
