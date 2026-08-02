package com.date.backend.domain.safety.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "safety_events")
public class SafetyEvent {
	@Id
	@Column(name = "event_id", length = 100)
	private String eventId;

	@Column(name = "session_id", nullable = false)
	private Long sessionId;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Enumerated(EnumType.STRING)
	@Column(name = "category", nullable = false, length = 50)
	private SafetyCategory category;

	@Enumerated(EnumType.STRING)
	@Column(name = "ai_severity", nullable = false, length = 20)
	private SafetySeverity aiSeverity;

	@Enumerated(EnumType.STRING)
	@Column(name = "effective_severity", nullable = false, length = 20)
	private SafetySeverity effectiveSeverity;

	@Column(name = "occurrence_count", nullable = false)
	private int occurrenceCount;

	@Column(name = "manner_penalty_score", nullable = false)
	private int mannerPenaltyScore;

	@Column(name = "reason_code", nullable = false, length = 100)
	private String reasonCode;

	@Column(name = "warning_message", nullable = false, length = 500)
	private String warningMessage;

	@Column(name = "confidence", precision = 6, scale = 5)
	private BigDecimal confidence;

	@Column(name = "deduplication_key", nullable = false, unique = true, length = 255)
	private String deduplicationKey;

	@Column(name = "session_elapsed_ms", nullable = false)
	private long sessionElapsedMs;

	@Column(name = "source", nullable = false, length = 80)
	private String source;

	@Column(name = "version", nullable = false)
	private int version;

	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	@Column(name = "received_at", nullable = false)
	private LocalDateTime receivedAt;

	@Column(name = "warning_delivered_at", nullable = false)
	private LocalDateTime warningDeliveredAt;

	protected SafetyEvent() {
	}

	public SafetyEvent(
			String eventId,
			Long sessionId,
			Long userId,
			SafetyCategory category,
			SafetySeverity aiSeverity,
			SafetySeverity effectiveSeverity,
			int occurrenceCount,
			String reasonCode,
			String warningMessage,
			BigDecimal confidence,
			String deduplicationKey,
			long sessionElapsedMs,
			String source,
			int version,
			LocalDateTime occurredAt,
			LocalDateTime receivedAt
	) {
		this.eventId = requireText(eventId, "eventId");
		this.sessionId = Objects.requireNonNull(sessionId);
		this.userId = Objects.requireNonNull(userId);
		this.category = Objects.requireNonNull(category);
		this.aiSeverity = Objects.requireNonNull(aiSeverity);
		this.effectiveSeverity = Objects.requireNonNull(effectiveSeverity);
		if (occurrenceCount <= 0 || sessionElapsedMs < 0 || version <= 0) {
			throw new IllegalArgumentException("안전 이벤트 수치가 올바르지 않습니다.");
		}
		this.occurrenceCount = occurrenceCount;
		this.mannerPenaltyScore = effectiveSeverity.mannerPenaltyScore();
		this.reasonCode = requireText(reasonCode, "reasonCode");
		this.warningMessage = requireText(warningMessage, "warningMessage");
		if (confidence != null
				&& (confidence.signum() < 0 || confidence.compareTo(BigDecimal.ONE) > 0)) {
			throw new IllegalArgumentException("confidence는 0 이상 1 이하여야 합니다.");
		}
		this.confidence = confidence;
		this.deduplicationKey = requireText(deduplicationKey, "deduplicationKey");
		this.sessionElapsedMs = sessionElapsedMs;
		this.source = requireText(source, "source");
		this.version = version;
		this.occurredAt = Objects.requireNonNull(occurredAt);
		this.receivedAt = Objects.requireNonNull(receivedAt);
		this.warningDeliveredAt = receivedAt;
	}

	private static String requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + "는 필수입니다.");
		}
		return value.trim();
	}
}
