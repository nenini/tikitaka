package com.date.backend.domain.mission.dto.response;

import java.util.List;

public record SessionMissionsResponse(
		Long sessionId,
		Long userId,
		List<SessionMissionResponse> missions
) {
	public SessionMissionsResponse {
		missions = List.copyOf(missions);
	}
}
