package com.date.backend.domain.mission.domain;

import com.date.backend.domain.room.domain.WaitingRoom;
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
@Table(name = "session_missions")
public class SessionMission {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "session_mission_id")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false)
	private WaitingRoom session;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "mission_id", nullable = false)
	private MissionCatalog mission;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private SessionMissionStatus status;

	@Column(name = "progress_value", nullable = false)
	private int progressValue;

	@Column(name = "target_value", nullable = false)
	private int targetValue;

	@Column(name = "assigned_at", nullable = false)
	private LocalDateTime assignedAt;

	@Column(name = "completed_at")
	private LocalDateTime completedAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	protected SessionMission() {
	}

	public SessionMission(
			WaitingRoom session,
			Long userId,
			MissionCatalog mission,
			LocalDateTime assignedAt
	) {
		this.session = Objects.requireNonNull(session);
		this.userId = Objects.requireNonNull(userId);
		this.mission = Objects.requireNonNull(mission);
		this.targetValue = mission.getTargetValue();
		this.status = SessionMissionStatus.ASSIGNED;
		this.assignedAt = Objects.requireNonNull(assignedAt);
		this.updatedAt = assignedAt;
	}

	public Long getId() {
		return id;
	}

	public Long getSessionId() {
		return session.getId();
	}

	public Long getUserId() {
		return userId;
	}

	public MissionCatalog getMission() {
		return mission;
	}

	public SessionMissionStatus getStatus() {
		return status;
	}

	public int getProgressValue() {
		return progressValue;
	}

	public int getTargetValue() {
		return targetValue;
	}

	public LocalDateTime getAssignedAt() {
		return assignedAt;
	}

	public LocalDateTime getCompletedAt() {
		return completedAt;
	}

	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}

	public boolean addProgress(int increment, LocalDateTime occurredAt) {
		if (increment <= 0) {
			throw new IllegalArgumentException(
					"미션 진행 증분은 0보다 커야 합니다."
			);
		}
		Objects.requireNonNull(occurredAt);
		if (status == SessionMissionStatus.COMPLETED) {
			return false;
		}
		progressValue = Math.min(targetValue, progressValue + increment);
		status = progressValue >= targetValue
				? SessionMissionStatus.COMPLETED
				: SessionMissionStatus.IN_PROGRESS;
		updatedAt = occurredAt;
		if (status == SessionMissionStatus.COMPLETED) {
			completedAt = occurredAt;
		}
		return true;
	}
}
