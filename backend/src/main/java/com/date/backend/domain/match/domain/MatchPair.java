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

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "match_pairs")
public class MatchPair {

	private static final BigDecimal MAX_COMPONENT_SCORE = new BigDecimal("100.000");
	private static final BigDecimal MAX_TOTAL_SCORE = new BigDecimal("100.000");

	/** 양쪽 수락이 끝난 뒤 세션이 시작되기까지의 대기 시간. */
	public static final int SESSION_START_DELAY_SECONDS = 30;

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "matchPairId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "requesterAId", nullable = false)
	private MatchRequest requestA;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "requesterBId", nullable = false)
	private MatchRequest requestB;

	@Column(name = "userAId", nullable = false)
	private Long userAId;

	@Column(name = "userBId", nullable = false)
	private Long userBId;

	@Column(name = "faceScore", nullable = false, precision = 6, scale = 3)
	private BigDecimal faceScore;

	@Column(name = "traitScore", nullable = false, precision = 6, scale = 3)
	private BigDecimal traitScore;

	@Column(name = "totalScore", nullable = false, precision = 6, scale = 3)
	private BigDecimal totalScore;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private MatchStatus status = MatchStatus.PENDING_ACCEPTANCE;

	@Column(name = "acceptDeadlineAt", nullable = false)
	private LocalDateTime acceptDeadlineAt;

	@Column(name = "matchedAt", nullable = false, updatable = false)
	private LocalDateTime matchedAt;

	@Column(name = "proposedScheduledAt", nullable = false, updatable = false)
	private LocalDateTime proposedScheduledAt;

	@Column(name = "scheduledAt")
	private LocalDateTime scheduledAt;

	@Column(name = "confirmedAt")
	private LocalDateTime confirmedAt;

	@Column(name = "cancelledAt")
	private LocalDateTime cancelledAt;

	@Column(name = "cancelledBy")
	private Long cancelledBy;

	@Column(name = "cancellationReason", length = 500)
	private String cancellationReason;

	@Column(name = "isLateCancellation", nullable = false)
	private boolean lateCancellation;

	@Column(name = "policyVersion", nullable = false)
	private long policyVersion = 1;

	@Column(name = "lateCancellationMinutesSnapshot", nullable = false)
	private int lateCancellationMinutesSnapshot = 60;

	@Column(name = "recentMatchExclusionDaysSnapshot", nullable = false)
	private int recentMatchExclusionDaysSnapshot = 7;

	@Column(name = "closedAt")
	private LocalDateTime closedAt;

	@Column(name = "completedAt")
	private LocalDateTime completedAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected MatchPair() {
	}

	public MatchPair(
			MatchRequest firstRequest,
			MatchRequest secondRequest,
			BigDecimal faceScore,
			BigDecimal traitScore,
			LocalDateTime acceptDeadlineAt,
			LocalDateTime proposedScheduledAt
	) {
		this(
				firstRequest,
				secondRequest,
				faceScore,
				traitScore,
				acceptDeadlineAt,
				proposedScheduledAt,
				null,
				1,
				60,
				7
		);
	}

	public MatchPair(
			MatchRequest firstRequest,
			MatchRequest secondRequest,
			BigDecimal faceScore,
			BigDecimal traitScore,
			LocalDateTime acceptDeadlineAt,
			LocalDateTime proposedScheduledAt,
			LocalDateTime matchedAt
	) {
		this(
				firstRequest,
				secondRequest,
				faceScore,
				traitScore,
				acceptDeadlineAt,
				proposedScheduledAt,
				matchedAt,
				1,
				60,
				7
		);
	}

	public MatchPair(
			MatchRequest firstRequest,
			MatchRequest secondRequest,
			BigDecimal faceScore,
			BigDecimal traitScore,
			LocalDateTime acceptDeadlineAt,
			LocalDateTime proposedScheduledAt,
			LocalDateTime matchedAt,
			long policyVersion,
			int lateCancellationMinutesSnapshot,
			int recentMatchExclusionDaysSnapshot
	) {
		MatchRequest left = Objects.requireNonNull(firstRequest);
		MatchRequest right = Objects.requireNonNull(secondRequest);
		if (left.getId() == null || right.getId() == null) {
			throw new IllegalArgumentException("저장된 매칭 요청만 페어링할 수 있습니다.");
		}
		if (left.getId().equals(right.getId())
				|| left.getUserId().equals(right.getUserId())) {
			throw new IllegalArgumentException("서로 다른 요청과 사용자만 페어링할 수 있습니다.");
		}

		if (left.getId() < right.getId()) {
			this.requestA = left;
			this.requestB = right;
		} else {
			this.requestA = right;
			this.requestB = left;
		}
		this.userAId = requestA.getUserId();
		this.userBId = requestB.getUserId();
		this.faceScore = validateScore(faceScore, MAX_COMPONENT_SCORE, "얼굴상 점수");
		this.traitScore = validateScore(traitScore, MAX_COMPONENT_SCORE, "성격 점수");
		this.totalScore = this.faceScore.add(this.traitScore);
		if (totalScore.compareTo(MAX_TOTAL_SCORE) > 0) {
			throw new IllegalArgumentException("총 매칭 점수는 100점을 초과할 수 없습니다.");
		}
		this.acceptDeadlineAt = Objects.requireNonNull(acceptDeadlineAt);
		this.proposedScheduledAt = Objects.requireNonNull(proposedScheduledAt);
		if (!this.proposedScheduledAt.isAfter(this.acceptDeadlineAt)) {
			throw new IllegalArgumentException(
					"제안 세션 시각은 수락 마감 시각보다 늦어야 합니다."
			);
		}
		this.matchedAt = matchedAt;
		if (policyVersion <= 0
				|| lateCancellationMinutesSnapshot <= 0
				|| recentMatchExclusionDaysSnapshot <= 0) {
			throw new IllegalArgumentException("매칭 정책 스냅숏 값이 올바르지 않습니다.");
		}
		this.policyVersion = policyVersion;
		this.lateCancellationMinutesSnapshot = lateCancellationMinutesSnapshot;
		this.recentMatchExclusionDaysSnapshot = recentMatchExclusionDaysSnapshot;
	}

	public void confirm(LocalDateTime confirmedAt) {
		if (status != MatchStatus.PENDING_ACCEPTANCE) {
			throw new IllegalStateException("수락 대기 중인 매칭만 확정할 수 있습니다.");
		}
		LocalDateTime confirmationTime = Objects.requireNonNull(confirmedAt);
		if (!confirmationTime.isBefore(acceptDeadlineAt)) {
			throw new IllegalStateException("수락 마감이 지난 매칭은 확정할 수 없습니다.");
		}
		this.status = MatchStatus.CONFIRMED;
		this.confirmedAt = confirmationTime;
		// 세션은 제안 슬롯이 아니라 **양쪽 수락이 끝난 시점** 기준으로 잡는다.
		// confirm() 은 두 번째 수락에서만 불리므로 "둘 다 수락 후 30초"가 된다.
		// proposedScheduledAt 은 후보 탐색·수락 마감 산출에만 남고 시작 시각과 무관해졌으므로
		// "제안 시각이 확정 시각보다 늦어야 한다"는 가드를 지웠다.
		// (그 가드는 원래도 도달 불가였다 — 생성자가 proposed > acceptDeadline 을 강제하고
		//  위에서 confirmationTime < acceptDeadline 을 요구하므로 항상 참이었다.)
		this.scheduledAt = confirmationTime.plusSeconds(SESSION_START_DELAY_SECONDS);
	}

	public void reject() {
		reject(LocalDateTime.now());
	}

	public void reject(LocalDateTime rejectedAt) {
		if (status != MatchStatus.PENDING_ACCEPTANCE) {
			throw new IllegalStateException("수락 대기 중인 매칭만 거절할 수 있습니다.");
		}
		this.status = MatchStatus.REJECTED;
		this.closedAt = Objects.requireNonNull(rejectedAt);
	}

	public void expire() {
		expire(LocalDateTime.now());
	}

	public void expire(LocalDateTime expiredAt) {
		if (status != MatchStatus.PENDING_ACCEPTANCE) {
			throw new IllegalStateException("수락 대기 중인 매칭만 만료할 수 있습니다.");
		}
		this.status = MatchStatus.EXPIRED;
		this.closedAt = Objects.requireNonNull(expiredAt);
	}

	public void complete(LocalDateTime completedAt) {
		if (status != MatchStatus.CONFIRMED) {
			throw new IllegalStateException("확정된 매칭만 완료할 수 있습니다.");
		}
		LocalDateTime completionTime = Objects.requireNonNull(completedAt);
		if (scheduledAt == null || completionTime.isBefore(scheduledAt)) {
			throw new IllegalArgumentException("세션 시작 이후에만 매칭을 완료할 수 있습니다.");
		}
		this.status = MatchStatus.COMPLETED;
		this.completedAt = completionTime;
		this.closedAt = completionTime;
	}

	public void cancel(
			Long cancelledBy,
			LocalDateTime cancelledAt,
			String reason,
			Duration lateCancellationThreshold
	) {
		if (status != MatchStatus.CONFIRMED) {
			throw new IllegalStateException("확정된 매칭만 취소할 수 있습니다.");
		}
		if (!isParticipant(cancelledBy)) {
			throw new IllegalArgumentException("매칭 참여자만 취소할 수 있습니다.");
		}
		LocalDateTime cancellationTime = Objects.requireNonNull(cancelledAt);
		if (scheduledAt == null || !cancellationTime.isBefore(scheduledAt)) {
			throw new IllegalStateException("세션 시작 전까지만 매칭을 취소할 수 있습니다.");
		}
		Duration threshold = Objects.requireNonNull(lateCancellationThreshold);
		if (threshold.isNegative() || threshold.isZero()) {
			throw new IllegalArgumentException("직전 취소 기준 시간은 양수여야 합니다.");
		}
		this.status = MatchStatus.CANCELLED;
		this.cancelledBy = cancelledBy;
		this.cancelledAt = cancellationTime;
		this.cancellationReason = normalizeReason(reason);
		this.lateCancellation = !cancellationTime.isBefore(scheduledAt.minus(threshold));
		this.closedAt = cancellationTime;
	}

	public boolean isParticipant(Long userId) {
		return userAId.equals(userId) || userBId.equals(userId);
	}

	public boolean isAcceptanceExpired(LocalDateTime now) {
		return !Objects.requireNonNull(now).isBefore(acceptDeadlineAt);
	}

	@PrePersist
	void prePersist() {
		LocalDateTime now = LocalDateTime.now();
		if (matchedAt == null) {
			matchedAt = now;
		}
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = LocalDateTime.now();
	}

	private static BigDecimal validateScore(
			BigDecimal score,
			BigDecimal max,
			String label
	) {
		BigDecimal value = Objects.requireNonNull(score, label + "는 필수입니다.");
		if (value.scale() > 3
				|| value.compareTo(BigDecimal.ZERO) < 0
				|| value.compareTo(max) > 0) {
			throw new IllegalArgumentException(label + "가 유효하지 않습니다.");
		}
		return value;
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

	public MatchRequest getRequestA() {
		return requestA;
	}

	public MatchRequest getRequestB() {
		return requestB;
	}

	public Long getUserAId() {
		return userAId;
	}

	public Long getUserBId() {
		return userBId;
	}

	public BigDecimal getFaceScore() {
		return faceScore;
	}

	public BigDecimal getTraitScore() {
		return traitScore;
	}

	public BigDecimal getTotalScore() {
		return totalScore;
	}

	public MatchStatus getStatus() {
		return status;
	}

	public LocalDateTime getAcceptDeadlineAt() {
		return acceptDeadlineAt;
	}

	public LocalDateTime getMatchedAt() {
		return matchedAt;
	}

	public LocalDateTime getProposedScheduledAt() {
		return proposedScheduledAt;
	}

	public LocalDateTime getScheduledAt() {
		return scheduledAt;
	}

	public LocalDateTime getConfirmedAt() {
		return confirmedAt;
	}

	public LocalDateTime getCancelledAt() {
		return cancelledAt;
	}

	public Long getCancelledBy() {
		return cancelledBy;
	}

	public String getCancellationReason() {
		return cancellationReason;
	}

	public boolean isLateCancellation() {
		return lateCancellation;
	}

	public long getPolicyVersion() {
		return policyVersion;
	}

	public int getLateCancellationMinutesSnapshot() {
		return lateCancellationMinutesSnapshot;
	}

	public int getRecentMatchExclusionDaysSnapshot() {
		return recentMatchExclusionDaysSnapshot;
	}

	public LocalDateTime getClosedAt() {
		return closedAt;
	}

	public LocalDateTime getCompletedAt() {
		return completedAt;
	}
}
