package com.date.backend.domain.consent.domain;

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
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_consents")
public class UserConsent {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "userConsentId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "userId", nullable = false)
	private User user;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "consentTypeId", nullable = false)
	private ConsentType consentType;

	@Column(name = "consented", nullable = false)
	private boolean consented;

	@Column(name = "consentedAt")
	private LocalDateTime consentedAt;

	@Column(name = "withdrawnAt")
	private LocalDateTime withdrawnAt;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected UserConsent() {
	}

	public UserConsent(User user, ConsentType consentType, boolean consented, LocalDateTime decidedAt) {
		this.user = user;
		this.consentType = consentType;
		this.consented = consented;
		this.consentedAt = consented ? decidedAt : null;
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

	public void updateDecision(boolean consented, LocalDateTime decidedAt) {
		if (consented) {
			this.consented = true;
			this.consentedAt = decidedAt;
			this.withdrawnAt = null;
			return;
		}

		if (this.consented) {
			this.withdrawnAt = decidedAt;
		}
		this.consented = false;
	}

	public ConsentType getConsentType() {
		return consentType;
	}

	public boolean isConsented() {
		return consented;
	}

	public LocalDateTime getConsentedAt() {
		return consentedAt;
	}

	public LocalDateTime getWithdrawnAt() {
		return withdrawnAt;
	}

	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}
}
