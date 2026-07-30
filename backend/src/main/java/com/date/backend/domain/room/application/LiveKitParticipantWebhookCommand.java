package com.date.backend.domain.room.application;

import java.time.LocalDateTime;
import java.util.Objects;

public record LiveKitParticipantWebhookCommand(
		String eventId,
		EventType eventType,
		String roomName,
		String participantIdentity,
		String participantSid,
		Long userId,
		LocalDateTime occurredAt,
		LocalDateTime receivedAt
) {
	public LiveKitParticipantWebhookCommand {
		eventId = requireText(eventId, "eventId");
		eventType = Objects.requireNonNull(eventType);
		roomName = requireText(roomName, "roomName");
		participantIdentity = requireText(
				participantIdentity,
				"participantIdentity"
		);
		participantSid = requireText(participantSid, "participantSid");
		userId = Objects.requireNonNull(userId);
		occurredAt = Objects.requireNonNull(occurredAt);
		receivedAt = Objects.requireNonNull(receivedAt);
	}

	public enum EventType {
		PARTICIPANT_JOINED,
		PARTICIPANT_LEFT,
		PARTICIPANT_CONNECTION_ABORTED
	}

	private static String requireText(String value, String fieldName) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(fieldName + " must not be blank");
		}
		return value;
	}
}
