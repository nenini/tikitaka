package com.date.backend.domain.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "userId")
	private Long id;

	@Column(name = "email", nullable = false, unique = true)
	private String email;

	@Column(name = "passwordHash")
	private String passwordHash;

	@Column(name = "realName", nullable = false)
	private String realName;

	@Column(name = "phoneNumber")
	private String phoneNumber;

	@Column(name = "birthDate", nullable = false)
	private LocalDate birthDate;

	@Enumerated(EnumType.STRING)
	@Column(name = "accountStatus", nullable = false)
	private AccountStatus accountStatus = AccountStatus.ACTIVE;

	@Enumerated(EnumType.STRING)
	@Column(name = "role", nullable = false)
	private UserRole role = UserRole.USER;

	@Column(name = "adultVerifiedAt")
	private LocalDateTime adultVerifiedAt;

	@Column(name = "lastLoginAt")
	private LocalDateTime lastLoginAt;

	@Column(name = "withdrawnAt")
	private LocalDateTime withdrawnAt;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected User() {
	}

	public User(String email, String passwordHash, String realName, String phoneNumber, LocalDate birthDate) {
		this.email = email;
		this.passwordHash = passwordHash;
		this.realName = realName;
		this.phoneNumber = phoneNumber;
		this.birthDate = birthDate;
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

	public void recordLogin() {
		this.lastLoginAt = LocalDateTime.now();
	}

	public void changePassword(String passwordHash) {
		this.passwordHash = passwordHash;
	}

	public void withdraw(LocalDateTime withdrawnAt) {
		this.accountStatus = AccountStatus.WITHDRAWN;
		this.withdrawnAt = withdrawnAt;
	}

	public boolean isActive() {
		return accountStatus == AccountStatus.ACTIVE && withdrawnAt == null;
	}

	public Long getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public String getRealName() {
		return realName;
	}

	public String getPhoneNumber() {
		return phoneNumber;
	}

	public LocalDate getBirthDate() {
		return birthDate;
	}

	public AccountStatus getAccountStatus() {
		return accountStatus;
	}

	public UserRole getRole() {
		return role;
	}

	public LocalDateTime getWithdrawnAt() {
		return withdrawnAt;
	}
}
