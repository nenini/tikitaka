package com.date.backend.domain.mission.api;

import com.date.backend.domain.mission.dto.response.SessionMissionsResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Positive;

@Tag(name = "Mission", description = "세션 행동 미션 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface MissionSwaggerDocs {

	@Operation(
			summary = "내 세션 미션 조회",
			description = """
					세션 시작 당시의 개선 목표를 기준으로 배정된 행동 미션과
					현재 진행 상태를 조회합니다. 세션 참여자는 자신의 미션만
					조회할 수 있습니다.
					"""
	)
	ApiResponse<SessionMissionsResponse> getMyMissions(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);
}
