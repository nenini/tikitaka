package com.date.backend.domain.room.domain;

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
@Table(name = "session_participants")
public class RoomParticipant {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "session_participant_id")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false)
	private WaitingRoom room;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Column(name = "participant_role", nullable = false, length = 10)
	private String participantRole;

	@Column(name = "participation_status", nullable = false, length = 20)
	private String participationStatus;

	@Column(name = "joined_at")
	private LocalDateTime joinedAt;

	@Column(name = "left_at")
	private LocalDateTime leftAt;

	@Column(name = "participant_identity", nullable = false, length = 255)
	private String participantIdentity;

	@Column(name = "participant_sid", length = 255)
	private String participantSid;

	@Enumerated(EnumType.STRING)
	@Column(name = "connection_status", nullable = false, length = 20)
	private SessionConnectionStatus connectionStatus;

	@Column(name = "connected_at")
	private LocalDateTime connectedAt;

	@Column(name = "disconnected_at")
	private LocalDateTime disconnectedAt;

	@Column(name = "last_connection_event_at")
	private LocalDateTime lastConnectionEventAt;

	@Column(name = "expression_analysis_enabled", nullable = false)
	private boolean expressionAnalysisEnabled;

	@Column(name = "voice_analysis_enabled", nullable = false)
	private boolean voiceAnalysisEnabled;

	protected RoomParticipant() {
	}

	public RoomParticipant(WaitingRoom room, Long userId, String participantRole) {
		this.room = room;
		this.userId = userId;
		this.participantRole = participantRole;
		this.participationStatus = "WAITING";
		this.participantIdentity = identityOf(userId);
		this.connectionStatus = SessionConnectionStatus.DISCONNECTED;
	}

	public Long getUserId() {
		return userId;
	}

	public String getParticipantRole() {
		return participantRole;
	}

	public String getParticipationStatus() {
		return participationStatus;
	}

	public boolean isReady() {
		return "READY".equals(participationStatus);
	}

	public boolean markReady() {
		if (isReady()) {
			return false;
		}
		this.participationStatus = "READY";
		return true;
	}

	public boolean cancelReady() {
		if (!isReady()) {
			return false;
		}
		this.participationStatus = "WAITING";
		return true;
	}

	public boolean recordJoin(LocalDateTime joinedAt) {
		if (this.joinedAt != null) {
			return false;
		}
		this.joinedAt = Objects.requireNonNull(joinedAt);
		this.leftAt = null;
		return true;
	}

	public boolean isJoined() {
		return joinedAt != null && leftAt == null;
	}

	public LocalDateTime getJoinedAt() {
		return joinedAt;
	}

	public String getParticipantIdentity() {
		return participantIdentity;
	}

	public String getParticipantSid() {
		return participantSid;
	}

	public SessionConnectionStatus getConnectionStatus() {
		return connectionStatus;
	}

	public LocalDateTime getConnectedAt() {
		return connectedAt;
	}

	public LocalDateTime getDisconnectedAt() {
		return disconnectedAt;
	}

	public LocalDateTime getLastConnectionEventAt() {
		return lastConnectionEventAt;
	}

	public boolean recordConnected(
			String participantIdentity,
			String participantSid,
			LocalDateTime occurredAt
	) {
		validateConnectionEvent(participantIdentity, participantSid, occurredAt);
		if (isOlderThanLastEvent(occurredAt)) {
			return false;
		}

		boolean changed = connectionStatus != SessionConnectionStatus.CONNECTED
				|| !Objects.equals(this.participantSid, participantSid);
		this.participantSid = participantSid;
		this.connectionStatus = SessionConnectionStatus.CONNECTED;
		this.connectedAt = occurredAt;
		this.disconnectedAt = null;
		this.lastConnectionEventAt = occurredAt;
		return changed;
	}

	public boolean recordDisconnected(
			String participantIdentity,
			String participantSid,
			LocalDateTime occurredAt
	) {
		validateConnectionEvent(participantIdentity, participantSid, occurredAt);
		if (isOlderThanLastEvent(occurredAt)) {
			return false;
		}
		if (this.participantSid != null
				&& !this.participantSid.equals(participantSid)) {
			return false;
		}

		boolean changed = connectionStatus != SessionConnectionStatus.DISCONNECTED;
		this.participantSid = participantSid;
		this.connectionStatus = SessionConnectionStatus.DISCONNECTED;
		this.disconnectedAt = occurredAt;
		this.lastConnectionEventAt = occurredAt;
		return changed;
	}

	public boolean recordConnectionAborted(
			String participantIdentity,
			String participantSid,
			LocalDateTime occurredAt
	) {
		validateConnectionEvent(participantIdentity, participantSid, occurredAt);
		if (isOlderThanLastEvent(occurredAt)) {
			return false;
		}
		if (connectionStatus == SessionConnectionStatus.CONNECTED
				&& this.participantSid != null
				&& !this.participantSid.equals(participantSid)) {
			return false;
		}

		boolean changed = connectionStatus != SessionConnectionStatus.DISCONNECTED
				|| !Objects.equals(this.participantSid, participantSid);
		this.participantSid = participantSid;
		this.connectionStatus = SessionConnectionStatus.DISCONNECTED;
		this.disconnectedAt = occurredAt;
		this.lastConnectionEventAt = occurredAt;
		return changed;
	}

	private void validateConnectionEvent(
			String participantIdentity,
			String participantSid,
			LocalDateTime occurredAt
	) {
		if (!this.participantIdentity.equals(participantIdentity)) {
			throw new IllegalArgumentException("LiveKit participant identity가 일치하지 않습니다.");
		}
		if (participantSid == null || participantSid.isBlank()) {
			throw new IllegalArgumentException("LiveKit participant SID가 필요합니다.");
		}
		Objects.requireNonNull(occurredAt);
	}

	private boolean isOlderThanLastEvent(LocalDateTime occurredAt) {
		return lastConnectionEventAt != null
				&& occurredAt.isBefore(lastConnectionEventAt);
	}

	private static String identityOf(Long userId) {
		return "user-" + Objects.requireNonNull(userId);
	}
}
