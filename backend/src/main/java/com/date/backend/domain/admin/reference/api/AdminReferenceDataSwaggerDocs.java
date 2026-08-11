package com.date.backend.domain.admin.reference.api;

import com.date.backend.domain.admin.reference.dto.response.ReferenceDataSummaryResponse;
import com.date.backend.global.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Admin Reference Data", description = "관리자 사전 데이터 집계 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface AdminReferenceDataSwaggerDocs {

	@Operation(summary = "사전 데이터 개수 조회")
	@ApiResponses({
			@ApiResponse(responseCode = "200", description = "조회 성공"),
			@ApiResponse(responseCode = "401", description = "인증 필요"),
			@ApiResponse(responseCode = "403", description = "관리자 권한 필요")
	})
	com.date.backend.global.api.ApiResponse<ReferenceDataSummaryResponse> getSummary();
}
