package com.date.backend.domain.match.domain;

import com.date.backend.domain.survey.domain.FaceTagCatalog;
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
@Table(name = "match_requests")
public class MatchRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "matchRequestId")
	private Long id;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@Column(name = "preferredAgeMin", nullable = false)
	private short preferredAgeMin;

	@Column(name = "preferredAgeMax", nullable = false)
	private short preferredAgeMax;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "preferredFaceTagId", nullable = false)
	private FaceTagCatalog preferredFaceTag;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "actualFaceTagId", nullable = false)
	private FaceTagCatalog actualFaceTag;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private MatchRequestStatus status = MatchRequestStatus.WAITING;

	@Column(name = "requestedAt", nullable = false, updatable = false)
	private LocalDateTime requestedAt;

	@Column(name = "waitingStartedAt", nullable = false)
	private LocalDateTime waitingStartedAt;

	@Column(name = "matchedAt")
	private LocalDateTime matchedAt;

	@Column(name = "cancelledAt")
	private LocalDateTime cancelledAt;

	@Column(name = "expiresAt")
	private LocalDateTime expiresAt;

	@Column(name = "cancellationReason", length = 500)
	private String cancellationReason;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected MatchRequest() {
	}

	public MatchRequest(
			Long userId,
			short preferredAgeMin,
			short preferredAgeMax,
			FaceTagCatalog preferredFaceTag,
			FaceTagCatalog actualFaceTag
	) {
		this(
				userId,
				preferredAgeMin,
				preferredAgeMax,
				preferredFaceTag,
				actualFaceTag,
				LocalDateTime.now()
		);
	}

	public MatchRequest(
			Long userId,
			short preferredAgeMin,
			short preferredAgeMax,
			FaceTagCatalog preferredFaceTag,
			FaceTagCatalog actualFaceTag,
			LocalDateTime waitingStartedAt
	) {
		validateAgeRange(preferredAgeMin, preferredAgeMax);
		this.userId = Objects.requireNonNull(userId, "사용자 ID는 필수입니다.");
		this.preferredAgeMin = preferredAgeMin;
		this.preferredAgeMax = preferredAgeMax;
		this.preferredFaceTag = Objects.requireNonNull(
				preferredFaceTag,
				"선호 얼굴상 snapshot은 필수입니다."
		);
		this.actualFaceTag = Objects.requireNonNull(
				actualFaceTag,
				"현재 얼굴상 snapshot은 필수입니다."
		);
		this.waitingStartedAt = Objects.requireNonNull(waitingStartedAt);
	}

	public void updateSnapshot(
			short preferredAgeMin,
			short preferredAgeMax,
			FaceTagCatalog preferredFaceTag,
			FaceTagCatalog actualFaceTag,
			LocalDateTime waitingStartedAt
	) {
		if (status != MatchRequestStatus.WAITING) {
			throw new IllegalStateException("대기 중인 매칭 요청만 수정할 수 있습니다.");
		}
		validateAgeRange(preferredAgeMin, preferredAgeMax);
		this.preferredAgeMin = preferredAgeMin;
		this.preferredAgeMax = preferredAgeMax;
		this.preferredFaceTag = Objects.requireNonNull(preferredFaceTag);
		this.actualFaceTag = Objects.requireNonNull(actualFaceTag);
		this.waitingStartedAt = Objects.requireNonNull(waitingStartedAt);
	}

	public void markMatchFound(LocalDateTime matchedAt) {
		if (status != MatchRequestStatus.WAITING) {
			throw new IllegalStateException("대기 중인 요청만 매칭할 수 있습니다.");
		}
		this.status = MatchRequestStatus.MATCH_FOUND;
		this.matchedAt = Objects.requireNonNull(matchedAt);
	}

	public void returnToWaiting(LocalDateTime waitingStartedAt) {
		if (status != MatchRequestStatus.MATCH_FOUND) {
			throw new IllegalStateException("상대가 정해진 요청만 대기 상태로 복귀할 수 있습니다.");
		}
		this.status = MatchRequestStatus.WAITING;
		this.matchedAt = null;
		this.waitingStartedAt = Objects.requireNonNull(waitingStartedAt);
	}

	public void confirm() {
		if (status != MatchRequestStatus.MATCH_FOUND) {
			throw new IllegalStateException("상대가 정해진 요청만 확정할 수 있습니다.");
		}
		this.status = MatchRequestStatus.CONFIRMED;
	}

	public void cancel(LocalDateTime cancelledAt, String reason) {
		if (status == MatchRequestStatus.CANCELLED || status == MatchRequestStatus.EXPIRED) {
			throw new IllegalStateException("이미 종료된 매칭 요청입니다.");
		}
		this.status = MatchRequestStatus.CANCELLED;
		this.cancelledAt = Objects.requireNonNull(cancelledAt);
		this.cancellationReason = normalizeReason(reason);
	}

	public void expire(LocalDateTime expiresAt) {
		if (status == MatchRequestStatus.CANCELLED || status == MatchRequestStatus.EXPIRED) {
			throw new IllegalStateException("이미 종료된 매칭 요청입니다.");
		}
		this.status = MatchRequestStatus.EXPIRED;
		this.expiresAt = Objects.requireNonNull(expiresAt);
	}

	@PrePersist
	void prePersist() {
		LocalDateTime now = LocalDateTime.now();
		if (requestedAt == null) {
			requestedAt = now;
		}
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = LocalDateTime.now();
	}

	private static void validateAgeRange(short min, short max) {
		if (min <= 0 || max < min) {
			throw new IllegalArgumentException("유효한 선호 연령 범위가 필요합니다.");
		}
	}

	private static String normalizeReason(String reason) {
		if (reason == null) {
			return null;
		}
		String normalized = reason.strip();
		if (normalized.length() > 500) {
			throw new IllegalArgumentException("취소 사유는 500자 이하여야 합니다.");
		}
		return normalized.isEmpty() ? null : normalized;
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public short getPreferredAgeMin() {
		return preferredAgeMin;
	}

	public short getPreferredAgeMax() {
		return preferredAgeMax;
	}

	public FaceTagCatalog getPreferredFaceTag() {
		return preferredFaceTag;
	}

	public FaceTagCatalog getActualFaceTag() {
		return actualFaceTag;
	}

	public MatchRequestStatus getStatus() {
		return status;
	}

	public LocalDateTime getRequestedAt() {
		return requestedAt;
	}

	public LocalDateTime getWaitingStartedAt() {
		return waitingStartedAt;
	}

	public LocalDateTime getMatchedAt() {
		return matchedAt;
	}

	public LocalDateTime getCancelledAt() {
		return cancelledAt;
	}

	public LocalDateTime getExpiresAt() {
		return expiresAt;
	}

	public String getCancellationReason() {
		return cancellationReason;
	}

	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}
}
