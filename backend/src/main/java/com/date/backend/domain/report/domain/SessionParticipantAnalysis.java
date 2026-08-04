package com.date.backend.domain.report.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "session_participant_analyses")
public class SessionParticipantAnalysis {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "participant_analysis_id") private Long id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "analysis_receipt_id", nullable = false) private SessionAnalysisReceipt receipt;
	@Column(name = "session_id", nullable = false) private Long sessionId;
	@Column(name = "user_id", nullable = false) private Long userId;
	@Enumerated(EnumType.STRING)
	@Column(name = "analysis_status", nullable = false, length = 20) private AnalysisStatus status;
	@Column(name = "axes_json", columnDefinition = "LONGTEXT") private String axesJson;
	@Column(name = "metrics_json", columnDefinition = "LONGTEXT") private String metricsJson;
	@Column(name = "created_at", nullable = false) private LocalDateTime createdAt;

	protected SessionParticipantAnalysis() {}

	public SessionParticipantAnalysis(SessionAnalysisReceipt receipt, Long sessionId, Long userId,
			AnalysisStatus status, String axesJson, String metricsJson, LocalDateTime createdAt) {
		this.receipt = receipt;
		this.sessionId = sessionId;
		this.userId = userId;
		this.status = status;
		this.axesJson = axesJson;
		this.metricsJson = metricsJson;
		this.createdAt = createdAt;
	}

	public Long getId() { return id; }
	public Long getSessionId() { return sessionId; }
	public Long getUserId() { return userId; }
	public AnalysisStatus getStatus() { return status; }
	public String getAxesJson() { return axesJson; }
	public String getMetricsJson() { return metricsJson; }
}
