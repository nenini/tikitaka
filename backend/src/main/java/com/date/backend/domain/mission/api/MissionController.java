package com.date.backend.domain.mission.api;

import com.date.backend.domain.mission.application.SessionMissionService;
import com.date.backend.domain.mission.dto.response.SessionMissionsResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
public class MissionController implements MissionSwaggerDocs {
	private final SessionMissionService sessionMissionService;

	public MissionController(SessionMissionService sessionMissionService) {
		this.sessionMissionService = sessionMissionService;
	}

	@GetMapping("/{sessionId}/missions")
	@Override
	public ApiResponse<SessionMissionsResponse> getMyMissions(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				sessionMissionService.getMyMissions(
						authUser.userId(),
						sessionId
				)
		);
	}
}
