package com.date.backend.domain.room.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "livekit_webhook_events")
public class LiveKitWebhookEvent {

	@Id
	@Column(name = "event_id", length = 255)
	private String eventId;

	@Column(name = "event_type", nullable = false, length = 80)
	private String eventType;

	@Column(name = "room_name", nullable = false, length = 255)
	private String roomName;

	@Column(name = "participant_identity", nullable = false, length = 255)
	private String participantIdentity;

	@Column(name = "received_at", nullable = false)
	private LocalDateTime receivedAt;

	protected LiveKitWebhookEvent() {
	}

	public LiveKitWebhookEvent(
			String eventId,
			String eventType,
			String roomName,
			String participantIdentity,
			LocalDateTime receivedAt
	) {
		this.eventId = requireText(eventId, "eventId");
		this.eventType = requireText(eventType, "eventType");
		this.roomName = requireText(roomName, "roomName");
		this.participantIdentity = requireText(
				participantIdentity,
				"participantIdentity"
		);
		this.receivedAt = Objects.requireNonNull(receivedAt);
	}

	public String getEventId() {
		return eventId;
	}

	private static String requireText(String value, String fieldName) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(fieldName + " must not be blank");
		}
		return value;
	}
}
