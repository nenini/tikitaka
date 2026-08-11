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

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "room_device_checks")
public class RoomDeviceCheck {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "roomDeviceCheckId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "sessionId", nullable = false)
	private WaitingRoom room;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@Column(name = "cameraPassed", nullable = false)
	private boolean cameraPassed;

	@Column(name = "microphonePassed", nullable = false)
	private boolean microphonePassed;

	@Column(name = "speakerPassed", nullable = false)
	private boolean speakerPassed;

	@Column(name = "networkPassed", nullable = false)
	private boolean networkPassed;

	@Column(name = "checkedAt", nullable = false, updatable = false)
	private LocalDateTime checkedAt;

	protected RoomDeviceCheck() {
	}

	public RoomDeviceCheck(
			WaitingRoom room,
			Long userId,
			boolean cameraPassed,
			boolean microphonePassed,
			boolean speakerPassed,
			boolean networkPassed,
			LocalDateTime checkedAt
	) {
		this.room = Objects.requireNonNull(room);
		this.userId = Objects.requireNonNull(userId);
		this.cameraPassed = cameraPassed;
		this.microphonePassed = microphonePassed;
		this.speakerPassed = speakerPassed;
		this.networkPassed = networkPassed;
		this.checkedAt = Objects.requireNonNull(checkedAt);
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public boolean isCameraPassed() {
		return cameraPassed;
	}

	public boolean isMicrophonePassed() {
		return microphonePassed;
	}

	public boolean isSpeakerPassed() {
		return speakerPassed;
	}

	public boolean isNetworkPassed() {
		return networkPassed;
	}

	public boolean isReadyAvailable() {
		return cameraPassed && microphonePassed && speakerPassed && networkPassed;
	}

	public LocalDateTime getCheckedAt() {
		return checkedAt;
	}
}
