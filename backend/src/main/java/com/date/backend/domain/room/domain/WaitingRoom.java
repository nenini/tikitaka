package com.date.backend.domain.room.domain;

import com.date.backend.domain.match.domain.MatchPair;
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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "sessions")
public class WaitingRoom {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "sessionId")
	private Long id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "matchPairId", nullable = false, unique = true)
	private MatchPair matchPair;

	@Column(name = "sessionType", nullable = false, length = 20)
	private String sessionType;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 30)
	private RoomSessionStatus status;

	@Column(name = "scheduledStartAt", nullable = false)
	private LocalDateTime scheduledStartAt;

	@Column(name = "actualStartAt")
	private LocalDateTime actualStartAt;

	@Column(name = "actualEndAt")
	private LocalDateTime actualEndAt;

	@Column(name = "plannedDurationSec", nullable = false)
	private int plannedDurationSec;

	@Column(name = "extensionDurationSec", nullable = false)
	private int extensionDurationSec;

	@Column(name = "terminationReason", length = 500)
	private String terminationReason;

	@Column(name = "livekitRoomName", unique = true, length = 255)
	private String livekitRoomName;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected WaitingRoom() {
	}

	public WaitingRoom(MatchPair matchPair) {
		this.matchPair = Objects.requireNonNull(matchPair);
		if (matchPair.getId() == null || matchPair.getScheduledAt() == null) {
			throw new IllegalArgumentException("확정되어 일정이 지정된 매칭만 대기방을 생성할 수 있습니다.");
		}
		this.sessionType = "REAL_DATE";
		this.status = RoomSessionStatus.SCHEDULED;
		this.scheduledStartAt = matchPair.getScheduledAt();
		this.plannedDurationSec = 1800;
		this.extensionDurationSec = 0;
		this.livekitRoomName = "date-room-" + matchPair.getId();
	}

	@PrePersist
	void prePersist() {
		LocalDateTime now = LocalDateTime.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = LocalDateTime.now();
	}

	public Long getId() {
		return id;
	}

	public MatchPair getMatchPair() {
		return matchPair;
	}

	public RoomSessionStatus getStatus() {
		return status;
	}

	public LocalDateTime getScheduledStartAt() {
		return scheduledStartAt;
	}

	public LocalDateTime getActualStartAt() {
		return actualStartAt;
	}

	public LocalDateTime getActualEndAt() {
		return actualEndAt;
	}

	public int getPlannedDurationSec() {
		return plannedDurationSec;
	}

	public String getLivekitRoomName() {
		return livekitRoomName;
	}
}
