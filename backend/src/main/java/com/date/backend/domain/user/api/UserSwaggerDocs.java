package com.date.backend.domain.user.api;

import com.date.backend.domain.auth.dto.response.UserResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "사용자", description = "인증 사용자 정보 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface UserSwaggerDocs {

	@Operation(
			summary = "내 정보 조회",
			description = "Bearer Access Token으로 인증된 사용자의 계정 정보를 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패")
	})
	ApiResponse<UserResponse> me(@Parameter(hidden = true) AuthUser authUser);
}
