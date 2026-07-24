package com.date.backend.domain.face.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "face_analysis_requests")
public class FaceAnalysisRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "analysisRequestId")
	private Long id;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private FaceAnalysisStatus status;

	@Enumerated(EnumType.STRING)
	@Column(name = "failureCode", length = 50)
	private FaceAnalysisFailureCode failureCode;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "expiresAt", nullable = false)
	private LocalDateTime expiresAt;

	@Column(name = "completedAt")
	private LocalDateTime completedAt;

	@Column(name = "failedAt")
	private LocalDateTime failedAt;

	protected FaceAnalysisRequest() {
	}

	public FaceAnalysisRequest(Long userId, LocalDateTime createdAt, LocalDateTime expiresAt) {
		this.userId = Objects.requireNonNull(userId, "사용자 ID는 필수입니다.");
		this.createdAt = Objects.requireNonNull(createdAt, "요청 생성 시각은 필수입니다.");
		this.expiresAt = Objects.requireNonNull(expiresAt, "요청 만료 시각은 필수입니다.");
		if (!expiresAt.isAfter(createdAt)) {
			throw new IllegalArgumentException("요청 만료 시각은 생성 시각 이후여야 합니다.");
		}
		this.status = FaceAnalysisStatus.PENDING;
	}

	public void validateOwner(Long userId) {
		if (!Objects.equals(this.userId, userId)) {
			throw new IllegalArgumentException("얼굴상 분석 요청의 소유자가 아닙니다.");
		}
	}

	public void validatePending() {
		if (status != FaceAnalysisStatus.PENDING) {
			throw new IllegalStateException("대기 중인 얼굴상 분석 요청만 처리할 수 있습니다.");
		}
	}

	public void validateNotExpired(LocalDateTime now) {
		Objects.requireNonNull(now, "검증 시각은 필수입니다.");
		if (isExpiredAt(now)) {
			throw new IllegalStateException("만료된 얼굴상 분석 요청입니다.");
		}
	}

	public boolean isExpiredAt(LocalDateTime now) {
		Objects.requireNonNull(now, "검증 시각은 필수입니다.");
		return !now.isBefore(expiresAt);
	}

	public void complete(LocalDateTime completedAt) {
		validatePending();
		validateNotExpired(completedAt);
		this.status = FaceAnalysisStatus.COMPLETED;
		this.completedAt = completedAt;
	}

	public void fail(FaceAnalysisFailureCode failureCode, LocalDateTime failedAt) {
		validatePending();
		validateNotExpired(failedAt);
		this.failureCode = Objects.requireNonNull(failureCode, "실패 코드는 필수입니다.");
		this.status = FaceAnalysisStatus.FAILED;
		this.failedAt = failedAt;
	}

	public void expire(LocalDateTime now) {
		validatePending();
		if (!isExpiredAt(now)) {
			throw new IllegalStateException("만료 시각이 지나지 않은 얼굴상 분석 요청입니다.");
		}
		this.status = FaceAnalysisStatus.EXPIRED;
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public FaceAnalysisStatus getStatus() {
		return status;
	}

	public FaceAnalysisFailureCode getFailureCode() {
		return failureCode;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getExpiresAt() {
		return expiresAt;
	}

	public LocalDateTime getCompletedAt() {
		return completedAt;
	}

	public LocalDateTime getFailedAt() {
		return failedAt;
	}
}
