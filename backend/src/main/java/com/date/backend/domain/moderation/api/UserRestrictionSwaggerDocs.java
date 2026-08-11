package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.dto.response.UserRestrictionStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Moderation", description = "신고, 차단, 노쇼 및 이용 제한 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface UserRestrictionSwaggerDocs {
	@Operation(summary = "내 이용 제한 상태 조회", description = "현재 활성 이용 제한, 누적 노쇼 횟수와 제한 시작·종료 시각을 조회합니다.")
	ApiResponse<UserRestrictionStatusResponse> get(@Parameter(hidden = true) AuthUser authUser);
}
