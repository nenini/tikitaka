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
@Table(name = "password_reset_tokens")
public class PasswordResetToken {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "passwordResetTokenId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "userId", nullable = false)
	private User user;

	@Column(name = "tokenHash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "expiresAt", nullable = false)
	private LocalDateTime expiresAt;

	@Column(name = "usedAt")
	private LocalDateTime usedAt;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	protected PasswordResetToken() {
	}

	public PasswordResetToken(User user, String tokenHash, LocalDateTime expiresAt) {
		this.user = user;
		this.tokenHash = tokenHash;
		this.expiresAt = expiresAt;
	}

	@PrePersist
	void prePersist() {
		this.createdAt = LocalDateTime.now();
	}

	public boolean isUsable(LocalDateTime now) {
		return usedAt == null && expiresAt.isAfter(now);
	}

	public void markUsed(LocalDateTime now) {
		this.usedAt = now;
	}

	public User getUser() {
		return user;
	}
}
