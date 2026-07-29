package com.date.backend.domain.coach.domain;

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
@Table(name = "ai_session_analysis_events")
public class AiSessionAnalysisEvent {

	@Id
	@Column(name = "event_id", length = 100)
	private String eventId;

	@Column(name = "session_id", nullable = false)
	private Long sessionId;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Enumerated(EnumType.STRING)
	@Column(name = "analysis_type", nullable = false, length = 20)
	private AiAnalysisType analysisType;

	@Column(name = "event_type", nullable = false, length = 80)
	private String eventType;

	@Column(name = "source", nullable = false, length = 80)
	private String source;

	@Column(name = "version", nullable = false)
	private int version;

	@Column(name = "participant_identity", length = 255)
	private String participantIdentity;

	@Column(name = "client_instance_id", length = 100)
	private String clientInstanceId;

	@Column(name = "sequence_number")
	private Long sequenceNumber;

	@Column(name = "session_elapsed_ms", nullable = false)
	private long sessionElapsedMs;

	@Column(name = "confidence", precision = 6, scale = 5)
	private BigDecimal confidence;

	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	@Column(name = "model_version", length = 100)
	private String modelVersion;

	@Column(name = "rule_version", length = 100)
	private String ruleVersion;

	@Column(name = "payload_json", nullable = false, columnDefinition = "LONGTEXT")
	private String payloadJson;

	@Column(name = "received_at", nullable = false)
	private LocalDateTime receivedAt;

	protected AiSessionAnalysisEvent() {
	}

	public AiSessionAnalysisEvent(
			String eventId,
			Long sessionId,
			Long userId,
			AiAnalysisType analysisType,
			String eventType,
			String source,
			int version,
			String participantIdentity,
			String clientInstanceId,
			Long sequenceNumber,
			long sessionElapsedMs,
			BigDecimal confidence,
			LocalDateTime occurredAt,
			String modelVersion,
			String ruleVersion,
			String payloadJson,
			LocalDateTime receivedAt
	) {
		this.eventId = requireText(eventId, "eventId");
		this.sessionId = Objects.requireNonNull(sessionId);
		this.userId = Objects.requireNonNull(userId);
		this.analysisType = Objects.requireNonNull(analysisType);
		this.eventType = requireText(eventType, "eventType");
		this.source = requireText(source, "source");
		if (version <= 0 || sessionElapsedMs < 0) {
			throw new IllegalArgumentException("version과 sessionElapsedMs가 올바르지 않습니다.");
		}
		if (confidence != null
				&& (confidence.signum() < 0 || confidence.compareTo(BigDecimal.ONE) > 0)) {
			throw new IllegalArgumentException("confidence는 0 이상 1 이하여야 합니다.");
		}
		this.version = version;
		this.participantIdentity = participantIdentity;
		this.clientInstanceId = clientInstanceId;
		this.sequenceNumber = sequenceNumber;
		this.sessionElapsedMs = sessionElapsedMs;
		this.confidence = confidence;
		this.occurredAt = Objects.requireNonNull(occurredAt);
		this.modelVersion = modelVersion;
		this.ruleVersion = ruleVersion;
		this.payloadJson = requireText(payloadJson, "payloadJson");
		this.receivedAt = Objects.requireNonNull(receivedAt);
	}

	private static String requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + "는 필수입니다.");
		}
		return value.trim();
	}

	public String getEventId() {
		return eventId;
	}
}
