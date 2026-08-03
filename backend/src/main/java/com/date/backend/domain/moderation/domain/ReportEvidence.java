package com.date.backend.domain.moderation.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "report_evidences")
public class ReportEvidence {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "reportEvidenceId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "reportId", nullable = false)
	private ModerationReport report;

	@Enumerated(EnumType.STRING)
	@Column(name = "evidenceType", nullable = false, length = 30)
	private ReportEvidenceType evidenceType;

	@Column(name = "objectKey", nullable = false, length = 1000)
	private String objectKey;

	@Column(name = "originalFileName", length = 255)
	private String originalFileName;

	@Column(name = "contentType", length = 100)
	private String contentType;

	@Column(name = "contentText", columnDefinition = "LONGTEXT")
	private String contentText;

	@Column(name = "sizeBytes", nullable = false)
	private long sizeBytes;

	@Column(name = "capturedAt")
	private LocalDateTime capturedAt;

	protected ReportEvidence() {
	}

	ReportEvidence(
			ModerationReport report,
			ReportEvidenceType evidenceType,
			String objectKey,
			String originalFileName,
			String contentType,
			long sizeBytes,
			LocalDateTime capturedAt
	) {
		this.report = Objects.requireNonNull(report);
		this.evidenceType = Objects.requireNonNull(evidenceType);
		this.objectKey = requireText(objectKey, "증거 저장소 키");
		this.originalFileName = trimToNull(originalFileName);
		this.contentType = trimToNull(contentType);
		if (sizeBytes < 0) {
			throw new IllegalArgumentException("증거 파일 크기는 0 이상이어야 합니다.");
		}
		this.sizeBytes = sizeBytes;
		this.capturedAt = capturedAt;
	}

	static ReportEvidence transcript(ModerationReport report, Long sessionId,
			String transcript, LocalDateTime generatedAt) {
		ReportEvidence evidence = new ReportEvidence(
				report,
				ReportEvidenceType.CHAT_TRANSCRIPT,
				"ai-session:" + sessionId + ":transcript",
				"session-" + sessionId + "-transcript.txt",
				"text/plain; charset=UTF-8",
				transcript.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
				generatedAt
		);
		evidence.contentText = requireText(transcript, "STT 원문");
		return evidence;
	}

	private static String requireText(String value, String fieldName) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(fieldName + "가 필요합니다.");
		}
		return value.trim();
	}

	private static String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public Long getId() {
		return id;
	}

	public ReportEvidenceType getEvidenceType() {
		return evidenceType;
	}

	public String getObjectKey() {
		return objectKey;
	}

	public String getOriginalFileName() {
		return originalFileName;
	}

	public String getContentType() {
		return contentType;
	}

	public long getSizeBytes() {
		return sizeBytes;
	}

	public LocalDateTime getCapturedAt() {
		return capturedAt;
	}

	public String getContentText() {
		return contentText;
	}
}
