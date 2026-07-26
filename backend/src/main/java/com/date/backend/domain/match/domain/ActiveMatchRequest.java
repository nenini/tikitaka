package com.date.backend.domain.match.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "active_match_requests")
public class ActiveMatchRequest {

	@Id
	@Column(name = "userId", nullable = false)
	private Long userId;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "matchRequestId", nullable = false, unique = true)
	private MatchRequest matchRequest;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	protected ActiveMatchRequest() {
	}

	public ActiveMatchRequest(Long userId, MatchRequest matchRequest) {
		this.userId = Objects.requireNonNull(userId);
		this.matchRequest = Objects.requireNonNull(matchRequest);
	}

	@PrePersist
	void prePersist() {
		createdAt = LocalDateTime.now();
	}

	public Long getUserId() {
		return userId;
	}

	public MatchRequest getMatchRequest() {
		return matchRequest;
	}
}
