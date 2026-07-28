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
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "match_responses")
public class MatchResponse {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "match_response_id")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "match_pair_id", nullable = false)
	private MatchPair matchPair;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Enumerated(EnumType.STRING)
	@Column(name = "response", nullable = false, length = 20)
	private MatchResponseStatus response = MatchResponseStatus.PENDING;

	@Column(name = "responded_at")
	private LocalDateTime respondedAt;

	protected MatchResponse() {
	}

	public MatchResponse(MatchPair matchPair, Long userId) {
		this.matchPair = Objects.requireNonNull(matchPair);
		this.userId = Objects.requireNonNull(userId);
		if (!matchPair.isParticipant(userId)) {
			throw new IllegalArgumentException("매칭 참여자 응답만 생성할 수 있습니다.");
		}
	}

	public void accept(LocalDateTime respondedAt) {
		respond(MatchResponseStatus.ACCEPTED, respondedAt);
	}

	public void reject(LocalDateTime respondedAt) {
		respond(MatchResponseStatus.REJECTED, respondedAt);
	}

	private void respond(MatchResponseStatus nextStatus, LocalDateTime respondedAt) {
		if (response != MatchResponseStatus.PENDING) {
			throw new IllegalStateException("이미 처리된 매칭 응답입니다.");
		}
		this.response = nextStatus;
		this.respondedAt = Objects.requireNonNull(respondedAt);
	}

	public Long getId() {
		return id;
	}

	public MatchPair getMatchPair() {
		return matchPair;
	}

	public Long getUserId() {
		return userId;
	}

	public MatchResponseStatus getResponse() {
		return response;
	}

	public LocalDateTime getRespondedAt() {
		return respondedAt;
	}
}
