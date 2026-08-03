package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.dto.response.NoShowResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Positive;

@Tag(name = "Moderation", description = "신고, 차단, 노쇼 및 이용 제한 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface NoShowSwaggerDocs {
	@Operation(summary = "노쇼 판정 및 기록", description = "예약 시작 시각과 유예 시간이 지난 뒤, 먼저 입장한 참여자가 미입장 상대방의 노쇼를 기록합니다. 같은 세션의 반복 요청은 기존 기록을 반환합니다.")
	ApiResponse<NoShowResponse> record(@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "세션 ID", example = "1") @Positive Long sessionId);
}
