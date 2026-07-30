package com.date.backend.domain.silence.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "silence_events")
public class SilenceEvent {
	@Id
	@Column(name = "event_id", length = 100)
	private String eventId;

	@Column(name = "session_id", nullable = false)
	private Long sessionId;

	@Column(name = "silence_started_elapsed_ms", nullable = false)
	private long silenceStartedElapsedMs;

	@Column(name = "detected_elapsed_ms", nullable = false)
	private long detectedElapsedMs;

	@Column(name = "silence_duration_ms", nullable = false)
	private long silenceDurationMs;

	@Enumerated(EnumType.STRING)
	@Column(name = "intervention_stage", nullable = false, length = 40)
	private SilenceInterventionStage interventionStage;

	@Column(name = "source", nullable = false, length = 80)
	private String source;

	@Column(name = "version", nullable = false)
	private int version;

	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	@Column(name = "received_at", nullable = false)
	private LocalDateTime receivedAt;

	protected SilenceEvent() {
	}

	public SilenceEvent(
			String eventId,
			Long sessionId,
			long silenceStartedElapsedMs,
			long detectedElapsedMs,
			long silenceDurationMs,
			SilenceInterventionStage interventionStage,
			String source,
			int version,
			LocalDateTime occurredAt,
			LocalDateTime receivedAt
	) {
		if (eventId == null || eventId.isBlank() || source == null || source.isBlank()) {
			throw new IllegalArgumentException("침묵 이벤트 식별값은 필수입니다.");
		}
		if (silenceStartedElapsedMs < 0
				|| detectedElapsedMs < silenceStartedElapsedMs
				|| silenceDurationMs < 0
				|| version <= 0) {
			throw new IllegalArgumentException("침묵 이벤트 시간이 올바르지 않습니다.");
		}
		this.eventId = eventId.trim();
		this.sessionId = Objects.requireNonNull(sessionId);
		this.silenceStartedElapsedMs = silenceStartedElapsedMs;
		this.detectedElapsedMs = detectedElapsedMs;
		this.silenceDurationMs = silenceDurationMs;
		this.interventionStage = Objects.requireNonNull(interventionStage);
		this.source = source.trim();
		this.version = version;
		this.occurredAt = Objects.requireNonNull(occurredAt);
		this.receivedAt = Objects.requireNonNull(receivedAt);
	}
}
