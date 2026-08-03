package com.date.backend.domain.moderation.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "user_blocks")
public class UserBlock {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "userBlockId")
	private Long id;

	@Column(name = "blockerUserId", nullable = false)
	private Long blockerUserId;

	@Column(name = "blockedUserId", nullable = false)
	private Long blockedUserId;

	@Column(name = "reason", length = 500)
	private String reason;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	protected UserBlock() {
	}

	public UserBlock(Long blockerUserId, Long blockedUserId, String reason) {
		this.blockerUserId = Objects.requireNonNull(blockerUserId);
		this.blockedUserId = Objects.requireNonNull(blockedUserId);
		if (blockerUserId.equals(blockedUserId)) {
			throw new IllegalArgumentException("자기 자신을 차단할 수 없습니다.");
		}
		this.reason = reason == null || reason.isBlank()
				? null
				: reason.trim();
	}

	@PrePersist
	void prePersist() {
		createdAt = LocalDateTime.now();
	}

	public Long getId() {
		return id;
	}

	public Long getBlockerUserId() {
		return blockerUserId;
	}

	public Long getBlockedUserId() {
		return blockedUserId;
	}

	public String getReason() {
		return reason;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}
}
