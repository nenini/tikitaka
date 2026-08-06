package com.date.backend.domain.report.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "voice_session_analyses")
public class VoiceSessionAnalysis {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "voice_analysis_id") private Long id;
	@Column(name = "session_id", nullable = false) private Long sessionId;
	@Column(name = "user_id", nullable = false) private Long userId;
	@Column(name = "schema_version", nullable = false) private int schemaVersion;
	@Column(name = "analysis_version", nullable = false, length = 128) private String analysisVersion;
	@Column(name = "session_duration_ms", nullable = false) private long sessionDurationMs;
	@Column(name = "analyzed_at", nullable = false) private LocalDateTime analyzedAt;
	@Column(name = "metrics_json", nullable = false, columnDefinition = "LONGTEXT") private String metricsJson;
	@Column(name = "payload_hash", nullable = false, length = 64) private String payloadHash;
	@Column(name = "received_at", nullable = false) private LocalDateTime receivedAt;

	protected VoiceSessionAnalysis() {}

	public VoiceSessionAnalysis(Long sessionId, Long userId, int schemaVersion,
			String analysisVersion, long sessionDurationMs, LocalDateTime analyzedAt,
			String metricsJson, String payloadHash, LocalDateTime receivedAt) {
		this.sessionId = sessionId;
		this.userId = userId;
		this.schemaVersion = schemaVersion;
		this.analysisVersion = analysisVersion;
		this.sessionDurationMs = sessionDurationMs;
		this.analyzedAt = analyzedAt;
		this.metricsJson = metricsJson;
		this.payloadHash = payloadHash;
		this.receivedAt = receivedAt;
	}

	public Long getId() { return id; }
	public String getPayloadHash() { return payloadHash; }
}
