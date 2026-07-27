package com.date.backend.domain.match.domain;

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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "match_jobs")
public class MatchJob {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "matchJobId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "matchRequestId", nullable = false)
	private MatchRequest matchRequest;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private MatchJobStatus status = MatchJobStatus.PENDING;

	@Column(name = "attemptCount", nullable = false)
	private int attemptCount;

	@Column(name = "availableAt", nullable = false)
	private LocalDateTime availableAt;

	@Column(name = "claimedAt")
	private LocalDateTime claimedAt;

	@Column(name = "completedAt")
	private LocalDateTime completedAt;

	@Column(name = "failedAt")
	private LocalDateTime failedAt;

	@Column(name = "workerId", length = 100)
	private String workerId;

	@Column(name = "lastError", length = 1000)
	private String lastError;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected MatchJob() {
	}

	public MatchJob(MatchRequest matchRequest, LocalDateTime availableAt) {
		this.matchRequest = Objects.requireNonNull(matchRequest);
		this.availableAt = Objects.requireNonNull(availableAt);
	}

	public void claim(String workerId, LocalDateTime claimedAt) {
		if (status != MatchJobStatus.PENDING) {
			throw new IllegalStateException("대기 중인 매칭 작업만 선점할 수 있습니다.");
		}
		this.status = MatchJobStatus.PROCESSING;
		this.workerId = normalizeWorkerId(workerId);
		this.claimedAt = Objects.requireNonNull(claimedAt);
		this.attemptCount++;
	}

	public void complete(LocalDateTime completedAt) {
		if (status != MatchJobStatus.PROCESSING) {
			throw new IllegalStateException("처리 중인 매칭 작업만 완료할 수 있습니다.");
		}
		this.status = MatchJobStatus.COMPLETED;
		this.completedAt = Objects.requireNonNull(completedAt);
		this.lastError = null;
	}

	public void fail(String error, LocalDateTime failedAt) {
		if (status != MatchJobStatus.PROCESSING) {
			throw new IllegalStateException("처리 중인 매칭 작업만 실패 처리할 수 있습니다.");
		}
		this.status = MatchJobStatus.FAILED;
		this.failedAt = Objects.requireNonNull(failedAt);
		this.lastError = normalizeError(error);
	}

	public void reschedule(String error, LocalDateTime availableAt) {
		if (status != MatchJobStatus.PROCESSING) {
			throw new IllegalStateException("처리 중인 매칭 작업만 재시도할 수 있습니다.");
		}
		this.status = MatchJobStatus.PENDING;
		this.availableAt = Objects.requireNonNull(availableAt);
		this.claimedAt = null;
		this.failedAt = null;
		this.workerId = null;
		this.lastError = normalizeError(error);
	}

	public boolean isOwnedBy(String workerId) {
		return status == MatchJobStatus.PROCESSING
				&& this.workerId != null
				&& this.workerId.equals(workerId);
	}

	@PrePersist
	void prePersist() {
		LocalDateTime now = LocalDateTime.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = LocalDateTime.now();
	}

	private String normalizeWorkerId(String workerId) {
		String normalized = Objects.requireNonNull(workerId).strip();
		if (normalized.isEmpty() || normalized.length() > 100) {
			throw new IllegalArgumentException("Worker ID가 올바르지 않습니다.");
		}
		return normalized;
	}

	private String normalizeError(String error) {
		if (error == null || error.isBlank()) {
			return "알 수 없는 매칭 작업 오류";
		}
		String normalized = error.strip();
		return normalized.length() <= 1000
				? normalized
				: normalized.substring(0, 1000);
	}

	public Long getId() {
		return id;
	}

	public MatchRequest getMatchRequest() {
		return matchRequest;
	}

	public MatchJobStatus getStatus() {
		return status;
	}

	public int getAttemptCount() {
		return attemptCount;
	}

	public LocalDateTime getAvailableAt() {
		return availableAt;
	}

	public LocalDateTime getClaimedAt() {
		return claimedAt;
	}

	public LocalDateTime getCompletedAt() {
		return completedAt;
	}

	public LocalDateTime getFailedAt() {
		return failedAt;
	}

	public String getWorkerId() {
		return workerId;
	}

	public String getLastError() {
		return lastError;
	}
}
