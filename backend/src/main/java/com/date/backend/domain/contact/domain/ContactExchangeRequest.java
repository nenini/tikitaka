package com.date.backend.domain.contact.domain;

import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "contact_exchange_requests")
public class ContactExchangeRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "contactExchangeRequestId")
	private Long id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "sessionId", nullable = false, unique = true)
	private WaitingRoom session;

	@Column(name = "requesterUserId", nullable = false)
	private Long requesterUserId;

	@Column(name = "targetUserId", nullable = false)
	private Long targetUserId;

	@Column(name = "requesterAgreed", nullable = false)
	private boolean requesterAgreed;

	@Column(name = "targetAgreed")
	private Boolean targetAgreed;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private ContactDecisionStatus status;

	@Column(name = "extensionAgreed", nullable = false)
	private boolean extensionAgreed;

	@Column(name = "requestedAt", nullable = false)
	private LocalDateTime requestedAt;

	@Column(name = "respondedAt")
	private LocalDateTime respondedAt;

	@Column(name = "disclosedAt")
	private LocalDateTime disclosedAt;

	protected ContactExchangeRequest() {
	}

	public ContactExchangeRequest(
			WaitingRoom session,
			Long requesterUserId,
			Long targetUserId,
			ContactDecision decision,
			LocalDateTime requestedAt
	) {
		this.session = Objects.requireNonNull(session);
		this.requesterUserId = Objects.requireNonNull(requesterUserId);
		this.targetUserId = Objects.requireNonNull(targetUserId);
		if (requesterUserId.equals(targetUserId)) {
			throw new IllegalArgumentException("요청자와 상대방은 달라야 합니다.");
		}
		this.requesterAgreed = decision == ContactDecision.AGREE;
		this.status = requesterAgreed
				? ContactDecisionStatus.PENDING
				: ContactDecisionStatus.DECLINED;
		this.extensionAgreed = false;
		this.requestedAt = Objects.requireNonNull(requestedAt);
		if (status == ContactDecisionStatus.DECLINED) {
			this.respondedAt = requestedAt;
		}
	}

	public boolean recordDecision(
			Long userId,
			ContactDecision decision,
			LocalDateTime decidedAt
	) {
		Objects.requireNonNull(userId);
		Objects.requireNonNull(decision);
		Objects.requireNonNull(decidedAt);

		if (requesterUserId.equals(userId)) {
			return verifyIdempotent(requesterAgreed, decision);
		}
		if (!targetUserId.equals(userId)) {
			throw new IllegalArgumentException("세션 참여자가 아닙니다.");
		}
		if (targetAgreed != null) {
			return verifyIdempotent(targetAgreed, decision);
		}

		targetAgreed = decision == ContactDecision.AGREE;
		respondedAt = decidedAt;
		if (targetAgreed && requesterAgreed) {
			status = ContactDecisionStatus.AGREED;
			extensionAgreed = true;
		} else {
			status = ContactDecisionStatus.DECLINED;
			extensionAgreed = false;
		}
		return true;
	}

	private boolean verifyIdempotent(
			boolean storedAgreement,
			ContactDecision decision
	) {
		if (storedAgreement == (decision == ContactDecision.AGREE)) {
			return false;
		}
		throw new BusinessException(
				SessionErrorCode.SESSION_EXTENSION_DECISION_CONFLICT
		);
	}

	public Long getRequesterUserId() {
		return requesterUserId;
	}

	public Long getTargetUserId() {
		return targetUserId;
	}

	public ContactDecision requesterDecision() {
		return requesterAgreed ? ContactDecision.AGREE : ContactDecision.DECLINE;
	}

	public ContactDecision targetDecision() {
		if (targetAgreed == null) {
			return null;
		}
		return targetAgreed ? ContactDecision.AGREE : ContactDecision.DECLINE;
	}

	public ContactDecisionStatus getStatus() {
		return status;
	}

	public LocalDateTime getRequestedAt() {
		return requestedAt;
	}

	public LocalDateTime getRespondedAt() {
		return respondedAt;
	}
}
