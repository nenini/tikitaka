package com.date.backend.domain.auth.domain;

import com.date.backend.domain.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "refreshTokenId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "userId", nullable = false)
	private User user;

	@Column(name = "tokenHash", nullable = false)
	private String tokenHash;

	@Column(name = "expiresAt", nullable = false)
	private LocalDateTime expiresAt;

	@Column(name = "revokedAt")
	private LocalDateTime revokedAt;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "lastUsedAt")
	private LocalDateTime lastUsedAt;

	protected RefreshToken() {
	}

	public RefreshToken(User user, String tokenHash, LocalDateTime expiresAt) {
		this.user = user;
		this.tokenHash = tokenHash;
		this.expiresAt = expiresAt;
	}

	@PrePersist
	void prePersist() {
		this.createdAt = LocalDateTime.now();
	}

	public void markUsed() {
		this.lastUsedAt = LocalDateTime.now();
	}

	public void revoke() {
		this.revokedAt = LocalDateTime.now();
	}

	public void revokeAt(LocalDateTime revokedAt) {
		this.revokedAt = revokedAt;
	}

	public boolean isUsable(LocalDateTime now) {
		return revokedAt == null && expiresAt.isAfter(now);
	}

	public User getUser() {
		return user;
	}
}
