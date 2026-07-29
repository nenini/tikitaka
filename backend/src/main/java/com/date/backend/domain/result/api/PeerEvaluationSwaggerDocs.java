package com.date.backend.domain.result.api;

import com.date.backend.domain.result.dto.EvaluationItemsResponse;
import com.date.backend.domain.result.dto.EvaluationStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Positive;

@Tag(name = "Result", description = "세션 종료 후 상대 평가 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface PeerEvaluationSwaggerDocs {
	@Operation(
			summary = "상대 평가 항목 조회",
			description = "정상 종료된 세션의 참가자가 평가 항목과 상대 사용자 ID를 조회합니다."
	)
	ApiResponse<EvaluationItemsResponse> getItems(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);

	@Operation(
			summary = "양측 평가 제출 상태 조회",
			description = "본인과 상대방의 평가 제출 여부를 조회합니다."
	)
	ApiResponse<EvaluationStatusResponse> getStatus(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);
}
