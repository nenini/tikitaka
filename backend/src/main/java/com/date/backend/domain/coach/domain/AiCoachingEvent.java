package com.date.backend.domain.coach.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "ai_coaching_events")
public class AiCoachingEvent {
	@Id
	@Column(name = "event_id", length = 100)
	private String eventId;

	@Column(name = "session_id", nullable = false)
	private Long sessionId;

	@Column(name = "target_user_id", nullable = false)
	private Long targetUserId;

	@Column(name = "event_type", nullable = false, length = 40)
	private String eventType;

	@Column(name = "version", nullable = false)
	private int version;

	@Column(name = "source", nullable = false, length = 80)
	private String source;

	@Enumerated(EnumType.STRING)
	@Column(name = "coaching_type", nullable = false, length = 50)
	private CoachingType coachingType;

	@Column(name = "message_key", nullable = false, length = 100)
	private String messageKey;

	@Column(name = "message_text", length = 500)
	private String messageText;

	@Enumerated(EnumType.STRING)
	@Column(name = "priority", nullable = false, length = 20)
	private CoachingPriority priority;

	@Column(name = "reason_code", nullable = false, length = 100)
	private String reasonCode;

	@Column(name = "triggered_elapsed_ms", nullable = false)
	private long triggeredElapsedMs;

	@Column(name = "expires_elapsed_ms", nullable = false)
	private long expiresElapsedMs;

	@Column(name = "deduplication_key", nullable = false, unique = true, length = 255)
	private String deduplicationKey;

	@Enumerated(EnumType.STRING)
	@Column(name = "delivery_status", nullable = false, length = 20)
	private CoachingDeliveryStatus deliveryStatus;

	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	@Column(name = "received_at", nullable = false)
	private LocalDateTime receivedAt;

	@Column(name = "delivered_at")
	private LocalDateTime deliveredAt;

	protected AiCoachingEvent() {
	}

	public AiCoachingEvent(
			String eventId,
			Long sessionId,
			Long targetUserId,
			String eventType,
			int version,
			String source,
			CoachingType coachingType,
			String messageKey,
			String messageText,
			CoachingPriority priority,
			String reasonCode,
			long triggeredElapsedMs,
			long expiresElapsedMs,
			String deduplicationKey,
			CoachingDeliveryStatus deliveryStatus,
			LocalDateTime occurredAt,
			LocalDateTime receivedAt
	) {
		this.eventId = requireText(eventId, "eventId");
		this.sessionId = Objects.requireNonNull(sessionId);
		this.targetUserId = Objects.requireNonNull(targetUserId);
		this.eventType = requireText(eventType, "eventType");
		if (version <= 0 || triggeredElapsedMs < 0 || expiresElapsedMs < triggeredElapsedMs) {
			throw new IllegalArgumentException("코칭 버전 또는 세션 경과 시간이 올바르지 않습니다.");
		}
		this.version = version;
		this.source = requireText(source, "source");
		this.coachingType = Objects.requireNonNull(coachingType);
		this.messageKey = requireText(messageKey, "messageKey");
		this.messageText = trimToNull(messageText);
		this.priority = Objects.requireNonNull(priority);
		this.reasonCode = requireText(reasonCode, "reasonCode");
		this.triggeredElapsedMs = triggeredElapsedMs;
		this.expiresElapsedMs = expiresElapsedMs;
		this.deduplicationKey = requireText(deduplicationKey, "deduplicationKey");
		this.deliveryStatus = Objects.requireNonNull(deliveryStatus);
		this.occurredAt = Objects.requireNonNull(occurredAt);
		this.receivedAt = Objects.requireNonNull(receivedAt);
		this.deliveredAt = deliveryStatus == CoachingDeliveryStatus.DELIVERED
				? receivedAt
				: null;
	}

	private static String requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + "는 필수입니다.");
		}
		return value.trim();
	}

	private static String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public String getEventId() {
		return eventId;
	}

	public CoachingDeliveryStatus getDeliveryStatus() {
		return deliveryStatus;
	}
}
