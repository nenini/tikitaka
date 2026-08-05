package com.date.backend.domain.report.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "session_analysis_evidence_segments")
public class SessionAnalysisEvidenceSegment {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "evidence_segment_id") private Long id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "participant_analysis_id", nullable = false) private SessionParticipantAnalysis analysis;
	@Column(name = "evidence_key", nullable = false, length = 100) private String evidenceKey;
	@Enumerated(EnumType.STRING)
	@Column(name = "event_type", nullable = false, length = 30) private AnalysisEvidenceType eventType;
	@Column(name = "start_ms", nullable = false) private long startMs;
	@Column(name = "end_ms", nullable = false) private long endMs;
	@Column(name = "description", nullable = false, length = 500) private String description;

	protected SessionAnalysisEvidenceSegment() {}

	public SessionAnalysisEvidenceSegment(SessionParticipantAnalysis analysis, String evidenceKey,
			AnalysisEvidenceType eventType, long startMs, long endMs, String description) {
		this.analysis = analysis;
		this.evidenceKey = evidenceKey;
		this.eventType = eventType;
		this.startMs = startMs;
		this.endMs = endMs;
		this.description = description;
	}

	public String getEvidenceKey() { return evidenceKey; }
	public AnalysisEvidenceType getEventType() { return eventType; }
	public long getStartMs() { return startMs; }
	public long getEndMs() { return endMs; }
	public String getDescription() { return description; }
}
