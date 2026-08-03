package com.date.backend.domain.moderation.domain;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

@Entity
@Table(name = "reports")
public class ModerationReport {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "reportId")
	private Long id;

	@Column(name = "sessionId", nullable = false)
	private Long sessionId;

	@Column(name = "reporterUserId", nullable = false)
	private Long reporterUserId;

	@Column(name = "reportedUserId", nullable = false)
	private Long reportedUserId;

	@Enumerated(EnumType.STRING)
	@Column(name = "reportType", nullable = false, length = 50)
	private ModerationReportReason reason;

	@Column(name = "description", length = 2000)
	private String details;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private ModerationReportStatus status;

	@Enumerated(EnumType.STRING)
	@Column(name = "sessionStatusSnapshot", nullable = false, length = 30)
	private RoomSessionStatus sessionStatusSnapshot;

	@Column(name = "reportedAt", nullable = false)
	private LocalDateTime reportedAt;

	@Column(name = "resolvedAt")
	private LocalDateTime resolvedAt;

	@OneToMany(
			mappedBy = "report",
			cascade = CascadeType.ALL,
			orphanRemoval = true,
			fetch = FetchType.LAZY
	)
	private List<ReportEvidence> evidences = new ArrayList<>();

	protected ModerationReport() {
	}

	public ModerationReport(
			Long sessionId,
			Long reporterUserId,
			Long reportedUserId,
			ModerationReportReason reason,
			String details,
			RoomSessionStatus sessionStatusSnapshot,
			LocalDateTime reportedAt
	) {
		this.sessionId = Objects.requireNonNull(sessionId);
		this.reporterUserId = Objects.requireNonNull(reporterUserId);
		this.reportedUserId = Objects.requireNonNull(reportedUserId);
		if (reporterUserId.equals(reportedUserId)) {
			throw new IllegalArgumentException("자기 자신을 신고할 수 없습니다.");
		}
		this.reason = Objects.requireNonNull(reason);
		this.details = trimToNull(details);
		this.status = ModerationReportStatus.RECEIVED;
		this.sessionStatusSnapshot = Objects.requireNonNull(
				sessionStatusSnapshot
		);
		this.reportedAt = Objects.requireNonNull(reportedAt);
	}

	public void addEvidence(
			ReportEvidenceType type,
			String objectKey,
			String originalFileName,
			String contentType,
			long sizeBytes,
			LocalDateTime capturedAt
	) {
		evidences.add(new ReportEvidence(
				this,
				type,
				objectKey,
				originalFileName,
				contentType,
				sizeBytes,
				capturedAt
		));
	}

	private static String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public Long getId() {
		return id;
	}

	public Long getSessionId() {
		return sessionId;
	}

	public Long getReporterUserId() {
		return reporterUserId;
	}

	public Long getReportedUserId() {
		return reportedUserId;
	}

	public ModerationReportReason getReason() {
		return reason;
	}

	public String getDetails() {
		return details;
	}

	public ModerationReportStatus getStatus() {
		return status;
	}

	public RoomSessionStatus getSessionStatusSnapshot() {
		return sessionStatusSnapshot;
	}

	public LocalDateTime getReportedAt() {
		return reportedAt;
	}

	public List<ReportEvidence> getEvidences() {
		return Collections.unmodifiableList(evidences);
	}
}
