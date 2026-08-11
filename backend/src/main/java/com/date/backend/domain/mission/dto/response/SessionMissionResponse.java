package com.date.backend.domain.mission.dto.response;

import com.date.backend.domain.mission.domain.MissionProgressUnit;
import com.date.backend.domain.mission.domain.SessionMission;
import com.date.backend.domain.mission.domain.SessionMissionStatus;

import java.time.LocalDateTime;

public record SessionMissionResponse(
		Long sessionMissionId,
		String missionCode,
		String title,
		String description,
		SessionMissionStatus status,
		int progressValue,
		int targetValue,
		MissionProgressUnit progressUnit,
		LocalDateTime assignedAt,
		LocalDateTime completedAt,
		LocalDateTime updatedAt
) {
	public static SessionMissionResponse from(SessionMission sessionMission) {
		return new SessionMissionResponse(
				sessionMission.getId(),
				sessionMission.getMission().getCode(),
				sessionMission.getMission().getTitle(),
				sessionMission.getMission().getDescription(),
				sessionMission.getStatus(),
				sessionMission.getProgressValue(),
				sessionMission.getTargetValue(),
				sessionMission.getMission().getProgressUnit(),
				sessionMission.getAssignedAt(),
				sessionMission.getCompletedAt(),
				sessionMission.getUpdatedAt()
		);
	}
}
