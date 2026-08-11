package com.date.backend.domain.moderation.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "attendance_penalties")
public class AttendancePenalty {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "attendancePenaltyId") private Long id;
	@Column(name = "userId", nullable = false) private Long userId;
	@Column(name = "sessionId") private Long sessionId;
	@Column(name = "penaltyType", nullable = false, length = 20) private String penaltyType;
	@Column(name = "temperatureDelta", nullable = false) private int temperatureDelta;
	@Column(name = "noShowCountDelta", nullable = false) private int noShowCountDelta;
	@Column(name = "expiresAt") private LocalDateTime expiresAt;
	@Column(name = "createdAt", nullable = false, updatable = false) private LocalDateTime createdAt;

	protected AttendancePenalty() {}
	public AttendancePenalty(Long userId, Long sessionId, LocalDateTime createdAt) {
		this.userId = userId; this.sessionId = sessionId; this.penaltyType = "NO_SHOW";
		this.temperatureDelta = 0; this.noShowCountDelta = 1; this.createdAt = createdAt;
	}
	public Long getId() { return id; }
	public Long getUserId() { return userId; }
	public Long getSessionId() { return sessionId; }
	public LocalDateTime getCreatedAt() { return createdAt; }
}
