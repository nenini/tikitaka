package com.date.backend.domain.match.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "matching_policies")
public class MatchingPolicy {

	public static final long SINGLETON_ID = 1L;

	@Id
	@Column(name = "matchingPolicyId")
	private Long id;

	@Column(name = "faceTypeWeight", nullable = false)
	private int faceTypeWeight;

	@Column(name = "personalityWeight", nullable = false)
	private int personalityWeight;

	@Column(name = "acceptTimeoutHours", nullable = false)
	private int acceptTimeoutHours;

	@Column(name = "minimumAcceptanceWindowMinutes", nullable = false)
	private int minimumAcceptanceWindowMinutes;

	@Column(name = "minimumPreparationMinutes", nullable = false)
	private int minimumPreparationMinutes;

	@Column(name = "scheduleSearchDays", nullable = false)
	private int scheduleSearchDays;

	@Column(name = "recentMatchExclusionDays", nullable = false)
	private int recentMatchExclusionDays;

	@Column(name = "lateCancellationMinutes", nullable = false)
	private int lateCancellationMinutes;

	@Column(name = "policyVersion", nullable = false)
	private long policyVersion;

	@Column(name = "updatedBy")
	private Long updatedBy;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected MatchingPolicy() {
	}

	public MatchingPolicy(
			int faceTypeWeight,
			int personalityWeight,
			int acceptTimeoutHours,
			int minimumAcceptanceWindowMinutes,
			int minimumPreparationMinutes,
			int scheduleSearchDays,
			int recentMatchExclusionDays,
			int lateCancellationMinutes
	) {
		validate(
				faceTypeWeight,
				personalityWeight,
				acceptTimeoutHours,
				minimumAcceptanceWindowMinutes,
				minimumPreparationMinutes,
				scheduleSearchDays,
				recentMatchExclusionDays,
				lateCancellationMinutes
		);
		this.id = SINGLETON_ID;
		this.faceTypeWeight = faceTypeWeight;
		this.personalityWeight = personalityWeight;
		this.acceptTimeoutHours = acceptTimeoutHours;
		this.minimumAcceptanceWindowMinutes = minimumAcceptanceWindowMinutes;
		this.minimumPreparationMinutes = minimumPreparationMinutes;
		this.scheduleSearchDays = scheduleSearchDays;
		this.recentMatchExclusionDays = recentMatchExclusionDays;
		this.lateCancellationMinutes = lateCancellationMinutes;
		this.policyVersion = 1;
		this.createdAt = LocalDateTime.now();
		this.updatedAt = createdAt;
	}

	public void update(
			int faceTypeWeight,
			int personalityWeight,
			int acceptTimeoutHours,
			int minimumAcceptanceWindowMinutes,
			int minimumPreparationMinutes,
			int scheduleSearchDays,
			int recentMatchExclusionDays,
			int lateCancellationMinutes,
			Long updatedBy
	) {
		validate(
				faceTypeWeight,
				personalityWeight,
				acceptTimeoutHours,
				minimumAcceptanceWindowMinutes,
				minimumPreparationMinutes,
				scheduleSearchDays,
				recentMatchExclusionDays,
				lateCancellationMinutes
		);
		this.faceTypeWeight = faceTypeWeight;
		this.personalityWeight = personalityWeight;
		this.acceptTimeoutHours = acceptTimeoutHours;
		this.minimumAcceptanceWindowMinutes = minimumAcceptanceWindowMinutes;
		this.minimumPreparationMinutes = minimumPreparationMinutes;
		this.scheduleSearchDays = scheduleSearchDays;
		this.recentMatchExclusionDays = recentMatchExclusionDays;
		this.lateCancellationMinutes = lateCancellationMinutes;
		this.policyVersion++;
		this.updatedBy = updatedBy;
		this.updatedAt = LocalDateTime.now();
	}

	private static void validate(
			int faceTypeWeight,
			int personalityWeight,
			int acceptTimeoutHours,
			int minimumAcceptanceWindowMinutes,
			int minimumPreparationMinutes,
			int scheduleSearchDays,
			int recentMatchExclusionDays,
			int lateCancellationMinutes
	) {
		if (faceTypeWeight < 0 || faceTypeWeight > 100
				|| personalityWeight < 0 || personalityWeight > 100
				|| faceTypeWeight + personalityWeight != 100) {
			throw new IllegalArgumentException("매칭 가중치는 각각 0~100이고 합이 100이어야 합니다.");
		}
		if (acceptTimeoutHours < 1 || acceptTimeoutHours > 24
				|| minimumAcceptanceWindowMinutes < 1
				|| minimumAcceptanceWindowMinutes > acceptTimeoutHours * 60
				|| minimumPreparationMinutes < 0
				|| minimumPreparationMinutes > 1440
				|| scheduleSearchDays < 1 || scheduleSearchDays > 30
				|| recentMatchExclusionDays < 1 || recentMatchExclusionDays > 365
				|| lateCancellationMinutes < 1 || lateCancellationMinutes > 1440) {
			throw new IllegalArgumentException("매칭 운영 정책값의 허용 범위를 확인해 주세요.");
		}
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = LocalDateTime.now();
	}

	public Long getId() {
		return id;
	}

	public int getFaceTypeWeight() {
		return faceTypeWeight;
	}

	public int getPersonalityWeight() {
		return personalityWeight;
	}

	public int getAcceptTimeoutHours() {
		return acceptTimeoutHours;
	}

	public int getMinimumAcceptanceWindowMinutes() {
		return minimumAcceptanceWindowMinutes;
	}

	public int getMinimumPreparationMinutes() {
		return minimumPreparationMinutes;
	}

	public int getScheduleSearchDays() {
		return scheduleSearchDays;
	}

	public int getRecentMatchExclusionDays() {
		return recentMatchExclusionDays;
	}

	public int getLateCancellationMinutes() {
		return lateCancellationMinutes;
	}

	public long getPolicyVersion() {
		return policyVersion;
	}

	public Long getUpdatedBy() {
		return updatedBy;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}
}
