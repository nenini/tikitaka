package com.date.backend.domain.profile.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_profiles")
public class Profile {

	@Id
	@Column(name = "userId", nullable = false)
	private Long userId;

	@Column(name = "nickname", nullable = false, length = 30)
	private String nickname;

	@Enumerated(EnumType.STRING)
	@Column(name = "gender", nullable = false, length = 20)
	private Gender gender;

	@Column(name = "regionCity", nullable = false, length = 50)
	private String regionCity;

	@Column(name = "onboardingCompleted", nullable = false)
	private boolean onboardingCompleted = false;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected Profile() {
	}

	public Profile(Long userId, String nickname, Gender gender, String regionCity) {
		this.userId = userId;
		this.nickname = nickname;
		this.gender = gender;
		this.regionCity = regionCity;
	}

	@PrePersist
	void prePersist() {
		LocalDateTime now = LocalDateTime.now();
		this.createdAt = now;
		this.updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		this.updatedAt = LocalDateTime.now();
	}

	public void update(String nickname, Gender gender, String regionCity) {
		this.nickname = nickname;
		this.gender = gender;
		this.regionCity = regionCity;
	}

	public void completeOnboarding() {
		this.onboardingCompleted = true;
	}

	public Long getUserId() {
		return userId;
	}

	public String getNickname() {
		return nickname;
	}

	public Gender getGender() {
		return gender;
	}

	public String getRegionCity() {
		return regionCity;
	}

	public boolean isOnboardingCompleted() {
		return onboardingCompleted;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}
}
