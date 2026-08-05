package com.date.backend.domain.report.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "session_analysis_receipts")
public class SessionAnalysisReceipt {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "analysis_receipt_id")
	private Long id;
	@Column(name = "session_id", nullable = false) private Long sessionId;
	@Column(name = "schema_version", nullable = false) private int schemaVersion;
	@Column(name = "analysis_version", nullable = false, length = 50) private String analysisVersion;
	@Column(name = "payload_hash", nullable = false, length = 64) private String payloadHash;
	@Column(name = "duration_ms", nullable = false) private long durationMs;
	@Column(name = "analyzed_at", nullable = false) private LocalDateTime analyzedAt;
	@Column(name = "received_at", nullable = false) private LocalDateTime receivedAt;

	protected SessionAnalysisReceipt() {}

	public SessionAnalysisReceipt(Long sessionId, int schemaVersion, String analysisVersion,
			String payloadHash, long durationMs,
			LocalDateTime analyzedAt, LocalDateTime receivedAt) {
		this.sessionId = sessionId;
		this.schemaVersion = schemaVersion;
		this.analysisVersion = analysisVersion;
		this.payloadHash = payloadHash;
		this.durationMs = durationMs;
		this.analyzedAt = analyzedAt;
		this.receivedAt = receivedAt;
	}

	public Long getId() { return id; }
	public Long getSessionId() { return sessionId; }
	public String getAnalysisVersion() { return analysisVersion; }
	public String getPayloadHash() { return payloadHash; }
}
