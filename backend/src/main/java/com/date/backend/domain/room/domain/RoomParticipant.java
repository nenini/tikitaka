package com.date.backend.domain.room.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

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
	}

	public Long getUserId() {
		return userId;
	}

	public String getParticipationStatus() {
		return participationStatus;
	}
}
