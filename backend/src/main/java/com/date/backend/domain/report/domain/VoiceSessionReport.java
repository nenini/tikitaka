package com.date.backend.domain.report.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "voice_session_reports")
public class VoiceSessionReport {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "voice_report_id") private Long id;
	@Column(name = "session_id", nullable = false) private Long sessionId;
	@Column(name = "user_id", nullable = false) private Long userId;
	@Column(name = "schema_version", nullable = false) private int schemaVersion;
	@Column(name = "analysis_version", nullable = false, length = 128) private String analysisVersion;
	@Column(name = "report_version", nullable = false, length = 128) private String reportVersion;
	@Column(name = "report_status", nullable = false, length = 20) private String reportStatus;
	@Column(name = "generation_mode", nullable = false, length = 20) private String generationMode;
	@Column(name = "headline", length = 1000) private String headline;
	@Column(name = "notes_json", nullable = false, columnDefinition = "LONGTEXT") private String notesJson;
	@Column(name = "next_mission", length = 1000) private String nextMission;
	@Column(name = "payload_hash", nullable = false, length = 64) private String payloadHash;
	@Column(name = "generated_at", nullable = false) private LocalDateTime generatedAt;
	@Column(name = "received_at", nullable = false) private LocalDateTime receivedAt;

	protected VoiceSessionReport() {}

	public VoiceSessionReport(Long sessionId, Long userId, int schemaVersion,
			String analysisVersion, String reportVersion, String reportStatus,
			String generationMode, String headline, String notesJson, String nextMission,
			String payloadHash, LocalDateTime generatedAt, LocalDateTime receivedAt) {
		this.sessionId = sessionId;
		this.userId = userId;
		this.schemaVersion = schemaVersion;
		this.analysisVersion = analysisVersion;
		this.reportVersion = reportVersion;
		this.reportStatus = reportStatus;
		this.generationMode = generationMode;
		this.headline = headline;
		this.notesJson = notesJson;
		this.nextMission = nextMission;
		this.payloadHash = payloadHash;
		this.generatedAt = generatedAt;
		this.receivedAt = receivedAt;
	}

	public Long getId() { return id; }
	public String getPayloadHash() { return payloadHash; }
}
